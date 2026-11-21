import { z } from "zod";
import { Platform, DeviceStatus, PropertyDataType, ComponentType } from "iot-platform/deno"
import { FactoryFn, optional, withDefault } from '../types.ts';
import mqtt from "mqtt";
import { DeviceTransformed, TransformedExpose } from "./zigbee2mqtt/convertor.ts"
import { topicParser } from './zigbee2mqtt/topicParser.ts';
import { calculateHash } from './zigbee2mqtt/hash.ts';
import { spawnDevices } from './zigbee2mqtt/spawnDevices.ts';
import { filterByWhitelist } from './zigbee2mqtt/whitelistFilter.ts';
import { Device } from './zigbee2mqtt/types/device.ts';
import { transformAndOverrideDevice } from './zigbee2mqtt/convertor.ts';

const propertySchema = z.object({
    name: optional(z.string()),
    type: z.enum(PropertyDataType),
    format: optional(z.string()),
})
const overrideSchema = z.object({
    name: optional(z.string()),
    properties: optional(z.record(z.string(), propertySchema))
})

export const Schema = z.object({
    deeplApiKey: optional(z.string()),
    zigbeeMqtt: z.object({
        uri: z.string(),
        port: z.number(),
        prefix: withDefault(z.string(), "zigbee2mqtt"),
        username: optional(z.string()),
        password: optional(z.string()),
    }),
    whitelist: optional(z.array(z.string())),
    override: optional(z.record(z.string(), overrideSchema))
})

type Zigbee2MqttConfig = z.infer<typeof Schema>;

export const factory: FactoryFn<Zigbee2MqttConfig> = function (config, bridge, logger, storage) {
    let instances: Platform[] = [];
    let globalData: { devices: DeviceTransformed[], fingerprint: string } = { devices: [], fingerprint: "" };
    const availabilityCache: Record<string, DeviceStatus | undefined> = {};
    let refreshQueue = Promise.resolve();
    let closing = false;
    let cleanupPromise: Promise<void> | undefined;
    let zigbeeOnline = false;

    const zigbeeClient = mqtt.connect(bridge.zigbeeMqtt.uri, {
        port: bridge.zigbeeMqtt.port,
        keepalive: 30,
        username: bridge.zigbeeMqtt.username,
        password: bridge.zigbeeMqtt.password,
    });

    const pairing = new Platform(bridge.id, config.userName, bridge.name, config.mqtt.uri, config.mqtt.port, storage);
    const pairingNode = pairing.addNode("pairing", "Pairing", ComponentType.switch);
    const permitJoin = pairingNode.addProperty({
        propertyId: "power",
        name: "Allow joining",
        dataType: PropertyDataType.boolean,
        settable: true,
        callback: (value) => {
            if (value !== "true" && value !== "false") {
                logger.error("Invalid Zigbee pairing switch value");
                return false;
            }
            if (!zigbeeClient.connected || !zigbeeOnline || closing) {
                logger.error("Cannot change Zigbee pairing: Zigbee2MQTT is disconnected");
                return false;
            }
            try {
                zigbeeClient.publish(
                    `${bridge.zigbeeMqtt.prefix}/bridge/request/permit_join`,
                    JSON.stringify({ time: value === "true" ? 254 : 0 }),
                    (error) => {
                        if (error) logger.error("Failed to publish Zigbee pairing request", error);
                    },
                );
            } catch (error) {
                logger.error("Failed to publish Zigbee pairing request", error);
            }
            return false;
        },
    });
    const createPairingClient = pairing.createMqttInstance;
    pairing.createMqttInstance = (username, password, applyListeners) => {
        createPairingClient(username, password, (client) => {
            applyListeners(client);
            const updateStatus = () => {
                if (!closing) pairing.publishStatus(zigbeeClient.connected && zigbeeOnline ? DeviceStatus.ready : DeviceStatus.disconnected);
            };
            client.on("connect", updateStatus);
            client.on("reconnect", updateStatus);
        });
    };
    pairing.init();
    pairing.publishStatus(DeviceStatus.disconnected);

    zigbeeClient.on("connect", function () {
        logger.debug("connected");
        zigbeeClient.subscribe(`${bridge.zigbeeMqtt.prefix}/#`);
    });
    zigbeeClient.on("reconnect", () => logger.silly("zigbeeClient reconnected"))

    zigbeeClient.on("error", function (err) {
        logger.error("zigbeeClient error", err);
    });

    zigbeeClient.on("disconnect", function () {
        logger.debug("zigbeeClient disconnected");
    });
    zigbeeClient.on("close", () => {
        zigbeeOnline = false;
        if (!closing) pairing.publishStatus(DeviceStatus.disconnected);
    });

    zigbeeClient.on("message", function (topic, message) {
        if (closing) return;
        if (!topic.includes("logging") && !topic.startsWith(`${bridge.zigbeeMqtt.prefix}/bridge/`)) logger.debug("message", topic, message.toString());

        if (topic === `${bridge.zigbeeMqtt.prefix}/bridge/info` ||
            topic === `${bridge.zigbeeMqtt.prefix}/bridge/state` ||
            topic === `${bridge.zigbeeMqtt.prefix}/bridge/response/permit_join`) {
            let data: unknown;
            try {
                data = JSON.parse(message.toString());
            } catch {
                logger.error(`Invalid Zigbee2MQTT message on ${topic}`);
                return;
            }
            if (!data || typeof data !== "object") {
                logger.error(`Invalid Zigbee2MQTT message on ${topic}`);
                return;
            }
            if (topic.endsWith("/bridge/info")) {
                if (!("permit_join" in data) || typeof data.permit_join !== "boolean") {
                    logger.error("Zigbee2MQTT bridge info is missing permit_join");
                    return;
                }
                permitJoin.setValue(String(data.permit_join));
            } else if (topic.endsWith("/bridge/state")) {
                if (!("state" in data) || (data.state !== "online" && data.state !== "offline")) {
                    logger.error("Invalid Zigbee2MQTT bridge state");
                    return;
                }
                zigbeeOnline = data.state === "online";
                pairing.publishStatus(zigbeeOnline ? DeviceStatus.ready : DeviceStatus.disconnected);
            } else if ("status" in data && data.status === "error") {
                logger.error("Zigbee2MQTT rejected pairing request", "error" in data ? data.error : "Unknown error");
            } else if (!("status" in data) || data.status !== "ok") {
                logger.error("Invalid Zigbee2MQTT pairing response");
            }
            return;
        }

        const handle = topicParser(topic, message);

        handle(`${bridge.zigbeeMqtt.prefix}/bridge/devices`, function (_topic, message) {
            const devicesStr = message.toString();
            refreshQueue = refreshQueue
                .then(() => refreshDevices(devicesStr))
                .catch((err) => {
                    logger.error("Failed to refresh Zigbee devices", err);
                });
        });

        handle(`${bridge.zigbeeMqtt.prefix}/+`, function (_topic, message, [friendly_name]) {
            const plat = instances.find(byIdOrName(friendly_name));
            if (!plat) return;

            const data: { [key: string]: string | number | boolean } = JSON.parse(message.toString());
            Object.entries(data).forEach(([propertyId, value]) => {
                plat.publishPropertyData(
                    propertyId,
                    (_node, property) => {

                        const device = globalData.devices.find((d) =>
                            d.friendly_name === friendly_name
                        );

                        const exposes = device?.definition?.exposes.reduce<TransformedExpose | undefined>((acc, expose) => {
                            if ('features' in expose) {
                                const found = expose.features.find(expose => expose.propertyId === propertyId)
                                return found || acc;
                            }

                            return expose.propertyId === propertyId ? expose : acc
                        }, undefined);
                        if (!exposes) return String(value);

                        return exposes.translateForPlatform ? exposes.translateForPlatform(value) : String(value)
                    },
                );
            });
        });

        handle(`${bridge.zigbeeMqtt.prefix}/+/availability`, function (_topic, message, [friendly_name]) {
            const data: { state?: "online" | "offline" } = JSON.parse(message.toString());

            const status = data.state === "online" ? DeviceStatus.ready : DeviceStatus.disconnected;
            availabilityCache[friendly_name] = status;

            const plat = instances.find(byIdOrName(friendly_name));
            if (!plat) return;
            plat.publishStatus(status)
        })
    })

    async function refreshDevices(devicesStr: string) {
        if (closing) return;

        const hash = await calculateHash(devicesStr);
        if (closing) return;
        if (globalData.fingerprint === hash) {
            logger.debug("Fingerprint matches, skipping refresh");
            return;
        }

        const definitions = JSON.parse(devicesStr) as Device[];
        const filteredDefinitions = bridge.whitelist
            ? definitions.filter(filterByWhitelist(bridge.whitelist))
            : definitions;
        const devices = transformAndOverrideDevice(filteredDefinitions, bridge.override);

        logger.debug("Refreshing devices");
        globalData.fingerprint = "";
        await shutdownDevices(instances);
        instances = [];
        globalData = { devices, fingerprint: "" };
        if (closing) return;

        try {
            await spawnDevices(devices, publishSetToZigbee, { ...config, deeplApiKey: bridge.deeplApiKey }, logger, storage, instances);
        } catch (err) {
            try {
                await shutdownDevices(instances);
                instances = [];
            } catch (cleanupError) {
                throw new AggregateError([err, cleanupError], "Device rebuild and cleanup failed");
            }
            throw err;
        }
        globalData.fingerprint = hash;

        // Backfill last known availability from cache
        Object.entries(availabilityCache).forEach(([friendly_name, status]) => {
            const plat = instances.find(byIdOrName(friendly_name));
            if (!plat || !status) return;

            plat.publishStatus(status);
        });
    }

    function publishSetToZigbee(friendly_name: string, propertyName: string, dataType: PropertyDataType) {
        return (value: boolean | string | number) => {
            if (dataType === PropertyDataType.float || dataType === PropertyDataType.integer) {
                value = Number(value);
            }

            return zigbeeClient.publish(
                `zigbee2mqtt/${friendly_name}/set`,
                JSON.stringify({ [propertyName]: value }),
            );
        }
    }

    async function shutdownDevices(instances: Platform[]) {
        logger.warning("Shutting down clients");
        const results = await Promise.allSettled(
            instances.filter((plat) => plat.client).map((plat) => plat.disconnect())
        );
        const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
        if (errors.length) throw new AggregateError(errors, "Failed to shut down Zigbee device clients");
    }


    return {
        cleanUp: function () {
            closing = true;
            if (cleanupPromise) {
                return cleanupPromise;
            }

            cleanupPromise = (async () => {
                await refreshQueue;
                const results = await Promise.allSettled([
                    shutdownDevices(instances),
                    pairing.disconnect(),
                    zigbeeClient.endAsync(),
                ]);
                const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
                if (errors.length) throw new AggregateError(errors, "Failed to shut down Zigbee bridge");
                instances = [];
            })();
            return cleanupPromise;
        },
        healthCheck: function () {
            return [pairing, ...instances].map((plat) => {
                let connected = false;
                if (plat.client) {
                    connected = plat.client.connected;
                }
                return {
                    deviceId: plat.deviceId,
                    connected: plat === pairing ? connected && zigbeeClient.connected && zigbeeOnline : connected
                };
            })
        }
    }
}

function byIdOrName(friendlyName: string) {
    return (p: Platform) => Boolean(p.client) && (p.deviceName === friendlyName || p.deviceId === friendlyName)
}