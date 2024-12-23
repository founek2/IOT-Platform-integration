import SchemaValidator, { Type, string, number, array } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { Platform, DeviceStatus, PropertyDataType } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { FactoryFn } from '../types.ts';
import mqtt from "npm:mqtt@5";
import { DeviceTransformed, TransformedExpose } from "./zigbee2mqtt/convertor.ts"
import { topicParser } from './zigbee2mqtt/topicParser.ts';
import { calculateHash } from './zigbee2mqtt/hash.ts';
import { spawnDevices } from './zigbee2mqtt/spawnDevices.ts';
import { filterByWhitelist } from './zigbee2mqtt/whitelistFilter.ts';
import { Device } from './zigbee2mqtt/zigbeeTypes.ts';
import { transformAndOverrideDevice } from './zigbee2mqtt/convertor.ts';

const propertySchema = SchemaValidator({
    name: string.optional(),
    type: SchemaValidator.enum(PropertyDataType),
    format: string.optional(),
})
const overrideSchema = SchemaValidator({
    name: string.optional(),
    properties: SchemaValidator.record(string, propertySchema).optional()
})

export const Schema = SchemaValidator({
    deeplApiKey: string.optional(),
    zigbeeMqtt: {
        uri: string,
        port: number,
        prefix: string.optional("zigbee2mqtt"),
        username: string.optional(),
        password: string.optional(),
    },
    whitelist: array.of(string).optional(),
    override: SchemaValidator.record(string, overrideSchema).optional()
})

type Zigbee2MqttConfig = Type<typeof Schema>;

export const factory: FactoryFn<Zigbee2MqttConfig> = function (config, bridge, logger, storage) {
    let instances: Platform[] = [];
    let globalData: { devices: DeviceTransformed[], fingerprint: string } = { devices: [], fingerprint: "" };
    const availabilityCache: Record<string, DeviceStatus | undefined> = {};

    const zigbeeClient = mqtt.connect(bridge.zigbeeMqtt.uri, {
        port: bridge.zigbeeMqtt.port,
        keepalive: 30,
        username: bridge.zigbeeMqtt.username,
        password: bridge.zigbeeMqtt.password,
    });

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

    zigbeeClient.on("message", function (topic, message) {
        if (!topic.includes("logging") && !topic.startsWith("zigbee2mqtt/bridge/")) logger.debug("message", topic, message.toString());

        const handle = topicParser(topic, message);

        handle(`${bridge.zigbeeMqtt.prefix}/bridge/devices`, async function (_topic, message) {
            const devicesStr = message.toString();
            const hash = await calculateHash(devicesStr)
            if (globalData.fingerprint === hash) {
                logger.debug("Fingerprint matches, skipping refresh")
                return
            }

            const definitions = JSON.parse(devicesStr) as unknown as Device[]
            const filteredDefinitions = bridge.whitelist
                ? definitions.filter(filterByWhitelist(bridge.whitelist))
                : definitions;

            globalData = {
                devices: transformAndOverrideDevice(filteredDefinitions, bridge.override),
                fingerprint: hash,
            };

            logger.debug("Refreshing devices");
            await shutdownDevices(instances);
            instances = await spawnDevices(globalData.devices, publishSetToZigbee, { ...config, deeplApiKey: bridge.deeplApiKey }, logger, storage);

            // Backfill last known availability from cache
            Object.entries(availabilityCache).forEach(([friendly_name, status]) => {
                const plat = instances.find(byIdOrName(friendly_name));
                if (!plat || !status) return;

                plat.publishStatus(status)
            })

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

            const plat = instances.find((p) => p.deviceName === friendly_name);
            if (!plat) return;
            plat.publishStatus(status)
        })
    })

    function publishSetToZigbee(friendly_name: string, propertyName: string) {
        return (value: boolean | string | number) =>
            zigbeeClient.publish(
                `zigbee2mqtt/${friendly_name}/set/${propertyName}`,
                String(value),
            );
    }

    async function shutdownDevices(instances: Platform[]) {
        logger.warning("Shuting down clients");
        const promises = instances.map((plat) => plat.disconnect());
        await Promise.all(promises);
    }


    return {
        cleanUp: async function () {
            await shutdownDevices(instances)
            await zigbeeClient.endAsync()
        },
        healthCheck: function () {
            return instances.map((plat) => ({
                deviceId: plat.deviceId,
                connected: plat.client.connected
            }))
        }
    }
}

function byIdOrName(friendlyName: string) {
    return (p: Platform) => p.deviceName === friendlyName || p.deviceId === friendlyName
}