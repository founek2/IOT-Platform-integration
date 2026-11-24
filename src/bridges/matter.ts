import { z } from "zod";
import { MatterClient, parseBigIntAwareJson, toBigIntAwareJson, type MatterNode, type MatterNodeEvent } from "@matter-server/ws-client";
import { ComponentType, DeviceCommand, DeviceStatus, Platform, Property, PropertyDataType } from "iot-platform/deno";
import type { MqttClient } from "mqtt";
import { withDefault, type FactoryFn } from "../types.ts";
import { endpointName, endpointType, mapEvent, mapProperties, propertyValue, type MatterProperty } from "./matter/mapping.ts";
import { isTimeZone, matterTime, timeZoneSchedule, type TimeZone } from "./matter/time.ts";

export const Schema = z.object({
    matterUrl: withDefault(z.string(), "ws://192.168.25.5:5580/ws"),
});
type MatterConfig = z.infer<typeof Schema>;

const REPEAT_INTERVAL = 60_000;

interface DeviceInstance {
    platform: Platform;
    signature: string;
    properties: Map<string, { definition: MatterProperty; property: Property }>;
}

export const factory: FactoryFn<MatterConfig> = (config, bridge, logger, storage) => {
    let matterUrl = bridge.matterUrl;
    if (matterUrl === undefined) matterUrl = "ws://192.168.25.5:5580/ws";
    const url = new URL(matterUrl);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
        throw new Error("Matter server URL must use ws:// or wss://");
    }
    const client = new MatterClient(matterUrl, {
        logger: {
            debug: () => {},
            info: (message) => logger.debug(message),
            warn: (message) => logger.warning(message),
            error: (message) => logger.error(message),
        },
    });
    const devices = new Map<string, DeviceInstance>();
    const observedEvents = new Map<string, Map<string, MatterProperty>>();
    let closing = false;
    let connected = false;
    let busy = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let connectTask: Promise<void> | undefined;
    let queue = Promise.resolve();
    let timeQueue = Promise.resolve();
    const lastPublications = new WeakMap<Property, { value: string; time: number }>();
    const lastStatuses = new WeakMap<Platform, { value: DeviceStatus; time: number }>();
    const timeSchedules = new Map<string, { zone: TimeZone; timer?: ReturnType<typeof setTimeout> }>();
    const unconfirmedTimeZone = "unconfirmed";

    function publishProperty(property: Property, value: string, force = false) {
        const now = performance.now();
        const previous = lastPublications.get(property);
        if (!force && previous && previous.value === value && now - previous.time < REPEAT_INTERVAL) return;
        property.setValue(value);
        if (property.client && property.propertyTopic && !property.client.disconnected && !property.client.disconnecting) {
            lastPublications.set(property, { value, time: now });
        }
    }

    function publishDeviceStatus(platform: Platform, value: DeviceStatus, force = false) {
        const now = performance.now();
        const previous = lastStatuses.get(platform);
        if (!force && previous && previous.value === value && platform.status === value &&
            now - previous.time < REPEAT_INTERVAL) return;
        platform.publishStatus(value);
        if (platform.client && !platform.client.disconnected && !platform.client.disconnecting) {
            lastStatuses.set(platform, { value, time: now });
        }
    }

    function timeKey(id: string, endpoint: number) {
        return `${bridge.id}-matter-timezone-${id}-${endpoint}`;
    }

    function runTimeTask(work: () => Promise<void>) {
        const result = timeQueue.then(work);
        timeQueue = result.then(() => {}, () => {});
        return result;
    }

    function stopTimeSchedule(key: string) {
        const state = timeSchedules.get(key);
        if (state?.timer) clearTimeout(state.timer);
        timeSchedules.delete(key);
    }

    function scheduleTimeRefresh(id: string, endpoint: number, zone: TimeZone, delay: number) {
        const key = timeKey(id, endpoint);
        stopTimeSchedule(key);
        if (closing) return;
        const state: { zone: TimeZone; timer?: ReturnType<typeof setTimeout> } = { zone };
        timeSchedules.set(key, state);
        state.timer = setTimeout(() => {
            void runTimeTask(async () => {
                if (closing || timeSchedules.get(key) !== state) return;
                try {
                    const node = client.nodes[id];
                    if (!connected || !node?.available) throw new Error("Matter device is disconnected");
                    const timeZone = node.attributes[`${endpoint}/56/5`];
                    let reported: unknown;
                    if (Array.isArray(timeZone) && timeZone[0] && typeof timeZone[0] === "object") {
                        reported = timeZone[0].name || timeZone[0]["2"];
                    }
                    if (typeof reported === "string" && reported !== zone) {
                        storage.removeItem(key);
                        stopTimeSchedule(key);
                        logger.warning(`Matter time zone changed externally on node ${id}; stopped DST refresh`);
                        return;
                    }
                    const schedule = timeZoneSchedule(zone, Date.now(), Number(node.attributes[`${endpoint}/56/11`]));
                    await client.deviceCommand(node.node_id, endpoint, 56, "setDstOffset", { dstOffset: schedule.dstOffset });
                    if (timeSchedules.get(key) === state) scheduleTimeRefresh(id, endpoint, zone, schedule.refreshAt - Date.now());
                } catch (error) {
                    logger.error(`Failed to refresh Matter DST schedule for node ${id}`, error);
                    if (timeSchedules.get(key) === state) scheduleTimeRefresh(id, endpoint, zone, 60_000);
                }
            });
        }, Math.max(0, delay));
    }

    const pairing = new Platform(bridge.id, config.userName, bridge.name, config.mqtt.uri, config.mqtt.port, storage);
    const pairingNode = pairing.addNode("pairing", "Matter pairing", ComponentType.generic);
    const status = pairingNode.addProperty({
        propertyId: "status", name: "Pairing status", dataType: PropertyDataType.string,
    });
    const code = pairingNode.addProperty({
        propertyId: "code", name: "Matter pairing code", dataType: PropertyDataType.string,
        settable: true, retained: false,
    });

    // The SDK's standard message listeners log incoming payloads, including pairing codes.
    code.subscribe = (nodePrefix: string, mqttClient: MqttClient) => {
        const topic = `${nodePrefix}/${code.propertyId}/set`;
        mqttClient.subscribe(topic);
        mqttClient.on("message", (incoming, payload, packet) => {
            if (incoming !== topic) return;
            if (packet.retain) {
                logger.error("Ignoring retained Matter pairing code");
                status.setValue("Retained pairing codes are not accepted");
                return;
            }
            void commission(payload.toString());
        });
    };
    pairing.connect = () => {
        if (!pairing.meta) {
            logger.error("Cannot connect Matter pairing device without an IoT API key");
            return;
        }
        pairing.prefix = `v2/${pairing.userName}`;
        pairing.createMqttInstance(`device=${pairing.userName}/${pairing.deviceId}`, pairing.meta.apiKey, (mqttClient) => {
            pairing.publishStatus(DeviceStatus.init);
            const prefix = pairing.getDevicePrefix();
            mqttClient.subscribe(`${prefix}/$cmd/set`);
            pairing.advertise();
            pairing.nodes.forEach((node) => {
                node.subscribe(prefix, mqttClient);
                node.updateClient(prefix, mqttClient);
            });
            mqttClient.on("message", (topic, payload) => {
                if (topic !== `${prefix}/$cmd/set`) return;
                const command = payload.toString();
                if (command === DeviceCommand.restart || command === DeviceCommand.reset) {
                    pairing.publishStatus(DeviceStatus.disconnected);
                    mqttClient.end();
                    if (command === DeviceCommand.reset) {
                        pairing.forgot();
                        pairing.connectPairing();
                    } else {
                        pairing.connect();
                    }
                }
            });
            mqttClient.on("error", (error) => logger.error("Matter pairing MQTT error", error));
            mqttClient.on("connect", () => {
                pairing.emit("connect", mqttClient);
                pairing.publishStatus(connected ? DeviceStatus.ready : DeviceStatus.disconnected);
            });
            mqttClient.on("disconnect", () => pairing.publishStatus(DeviceStatus.lost));
            pairing.publishStatus(connected ? DeviceStatus.ready : DeviceStatus.disconnected);
        });
    };
    pairing.init();

    async function commission(value: string) {
        if (busy) {
            status.setValue("A commissioning attempt is already running");
            return;
        }
        if (!connected || !value.trim()) {
            status.setValue("Cannot commission: server disconnected or code empty");
            return;
        }
        busy = true;
        status.setValue("Commissioning");
        try {
            await client.commissionWithCode(value.trim(), false);
            status.setValue("Commissioned");
        } catch {
            // Server error details may contain the supplied code.
            logger.error("Matter commissioning failed; check the Matter Server logs");
            status.setValue("Commissioning failed; check Matter Server logs");
        } finally {
            busy = false;
        }
    }

    function enqueue(work: () => Promise<void>) {
        queue = queue.then(work).catch((error) => {
            logger.error("Failed to synchronize Matter devices", error);
            client.disconnect();
            markDisconnected();
            reconnect();
        });
    }

    function scheduleSync() {
        enqueue(syncDevices);
    }

    async function syncDevices() {
        if (closing || !connected) return;
        const nodes = client.nodes;
        for (const [id, instance] of devices) {
            if (!nodes[id]) {
                await instance.platform.disconnect();
                devices.delete(id);
                observedEvents.delete(id);
                for (const definition of instance.properties.values()) {
                    if (definition.definition.command === "time-zone") {
                        const key = timeKey(id, definition.definition.endpoint);
                        stopTimeSchedule(key);
                        storage.removeItem(key);
                    }
                }
            }
        }
        for (const [id, node] of Object.entries(nodes)) {
            if (closing || !connected) return;
            const definitions = mapProperties(node, client.serverInfo.schema_version);
            const events = observedEvents.get(id);
            if (events) definitions.push(...events.values());
            const name = node.nodeLabel || node.productName || `Matter ${id}`;
            const endpoints = new Set(definitions.map((definition) => definition.endpoint));
            if (!endpoints.size) endpoints.add(0);
            const endpointNames = new Map(Array.from(endpoints, (endpoint) => [endpoint, endpointName(node, endpoint)]));
            const signature = JSON.stringify({ name, definitions, endpointNames: Array.from(endpointNames) });
            let instance = devices.get(id);
            if (instance && instance.signature !== signature) {
                for (const { definition } of instance.properties.values()) {
                    if (definition.command === "time-zone" &&
                        !definitions.some((item) => item.path === definition.path && item.command === "time-zone")) {
                        stopTimeSchedule(timeKey(id, definition.endpoint));
                    }
                }
                await instance.platform.disconnect();
                devices.delete(id);
                instance = undefined;
            }
            if (!instance) {
                if (!definitions.length) logger.warning(`Matter node ${id} has no supported properties`);
                instance = createDevice(id, node, name, definitions, endpointNames, signature);
                devices.set(id, instance);
                try {
                    instance.platform.init();
                    if (instance.platform.client && !instance.platform.client.disconnected &&
                        !instance.platform.client.disconnecting) {
                        lastStatuses.set(instance.platform, { value: instance.platform.status, time: performance.now() });
                    }
                } catch (error) {
                    if (instance.platform.client) await instance.platform.disconnect();
                    devices.delete(id);
                    throw error;
                }
                for (const definition of definitions) {
                    if (definition.command !== "time-zone") continue;
                    const key = timeKey(id, definition.endpoint);
                    const saved = storage.getItem(key);
                    if (saved && isTimeZone(saved) && !timeSchedules.has(key)) {
                        scheduleTimeRefresh(id, definition.endpoint, saved, 0);
                    }
                }
            }
            publishNode(instance, node);
        }
    }

    function createDevice(id: string, node: MatterNode, name: string, definitions: MatterProperty[],
        endpointNames: Map<number, string>, signature: string): DeviceInstance {
        const platform = new Platform(`${bridge.id}-matter-${id}`, config.userName, name,
            config.mqtt.uri, config.mqtt.port, storage);
        const properties = new Map<string, { definition: MatterProperty; property: Property }>();
        for (const [endpoint, endpointLabel] of endpointNames) {
            const endpointProperties = definitions.filter((definition) => definition.endpoint === endpoint);
            const timeProperties = endpointProperties.filter((definition) =>
                definition.command === "sync-time" || definition.command === "time-zone");
            const normalProperties = endpointProperties.filter((definition) =>
                definition.command !== "sync-time" && definition.command !== "time-zone");
            let iotNode;
            if (normalProperties.length || !endpointProperties.length) {
                iotNode = platform.addNode(`endpoint${endpoint}`, endpointLabel, endpointType(normalProperties));
            }
            let timeNode;
            if (timeProperties.length) {
                const type = timeProperties.some((definition) => definition.command === "sync-time")
                    ? ComponentType.activator : ComponentType.generic;
                timeNode = platform.addNode(`endpoint${endpoint}-sync-time`, "Time", type);
            }
            for (const definition of endpointProperties) {
                const targetNode = definition.command === "sync-time" || definition.command === "time-zone"
                    ? timeNode : iotNode;
                if (!targetNode) throw new Error(`Missing Matter endpoint ${endpoint}`);
                const property = targetNode.addProperty({
                    propertyId: definition.id, name: definition.name, dataType: definition.type,
                    propertyClass: definition.propertyClass, unitOfMeasurement: definition.unit,
                    settable: Boolean(definition.command), format: definition.format,
                    callback: async (value) => {
                        try {
                            if (!connected) throw new Error("Matter server is disconnected");
                            if (definition.command === "sync-time") {
                                if (value !== "on") throw new Error("Expected on");
                                await client.deviceCommand(node.node_id, endpoint, 56, "setUtcTime",
                                    { utcTime: matterTime(Date.now()), granularity: 2 });
                            } else if (definition.command === "time-zone") {
                                if (!isTimeZone(value)) throw new Error("Invalid time zone");
                                await runTimeTask(async () => {
                                    if (!connected) throw new Error("Matter server is disconnected");
                                    const latest = client.nodes[id];
                                    if (!latest?.available) throw new Error("Matter device is disconnected");
                                    const schedule = timeZoneSchedule(value, Date.now(), Number(latest.attributes[`${endpoint}/56/11`]));
                                    const key = timeKey(id, endpoint);
                                    stopTimeSchedule(key);
                                    storage.setItem(key, unconfirmedTimeZone);
                                    publishProperty(property, "");
                                    await client.deviceCommand(node.node_id, endpoint, 56, "setTimeZone",
                                        { timeZone: [{ offset: schedule.standardOffset, validAt: 0, name: value }] });
                                    await client.deviceCommand(node.node_id, endpoint, 56, "setDstOffset",
                                        { dstOffset: schedule.dstOffset });
                                    storage.setItem(key, value);
                                    scheduleTimeRefresh(id, endpoint, value, schedule.refreshAt - Date.now());
                                    publishProperty(property, value);
                                });
                            } else if (definition.command === "onoff") {
                                if (value !== "true" && value !== "false") throw new Error("Expected true or false");
                                await client.deviceCommand(node.node_id, endpoint, 6, value === "true" ? "on" : "off", {});
                            } else if (definition.command === "level") {
                                const level = Number(value);
                                if (!Number.isInteger(level) || level < 0 || level > 254 || !value.trim()) {
                                    throw new Error("Brightness must be an integer from 0 to 254");
                                }
                                await client.deviceCommand(node.node_id, endpoint, 8, "moveToLevel",
                                    { level, transitionTime: 0, optionsMask: 0, optionsOverride: 0 });
                            } else if (definition.command === "write") {
                                let converted: unknown = value;
                                if (definition.enumValues) {
                                    if (!Object.hasOwn(definition.enumValues, value)) throw new Error("Invalid enum value");
                                    converted = definition.enumValues[value];
                                } else if (definition.type === PropertyDataType.boolean) {
                                    if (value !== "true" && value !== "false") throw new Error("Expected true or false");
                                    converted = value === "true";
                                } else if (definition.wideInteger) {
                                    if (!/^-?\d+$/.test(value)) throw new Error("Expected an integer");
                                    converted = BigInt(value);
                                } else if (definition.jsonKind) {
                                    converted = parseBigIntAwareJson(value);
                                    if (definition.jsonKind === "array" && !Array.isArray(converted)) throw new Error("Expected a JSON array");
                                    if (definition.jsonKind === "object" &&
                                        (!converted || typeof converted !== "object" || Array.isArray(converted))) throw new Error("Expected a JSON object");
                                    if (definition.jsonKind === "bitmap" &&
                                        typeof converted !== "number" && typeof converted !== "bigint") throw new Error("Expected a numeric bitmap");
                                } else if (definition.type === PropertyDataType.integer || definition.type === PropertyDataType.float) {
                                    if (!value.trim() || !Number.isFinite(Number(value))) throw new Error("Expected a number");
                                    let numeric = Number(value);
                                    if (definition.scale !== undefined) {
                                        const raw = numeric / definition.scale;
                                        const rounded = Math.round(raw);
                                        if (Math.abs(raw - rounded) > 0.000001) throw new Error("Value exceeds Matter precision");
                                        numeric = rounded;
                                    }
                                    if (definition.type === PropertyDataType.integer && !Number.isInteger(numeric)) {
                                        throw new Error("Expected an integer");
                                    }
                                    converted = numeric;
                                }
                                const results = definition.atomic
                                    ? await client.writeAtomicAttribute(node.node_id, definition.path, converted, undefined, {
                                        skipDataVersionCheck: true, timedRequestTimeoutMs: definition.timed ? 10000 : undefined,
                                    })
                                    : await client.writeAttribute(node.node_id, definition.path, converted,
                                        definition.timed ? { timedRequestTimeoutMs: 10000 } : undefined);
                                if (!results || results.length !== 1 || results[0].Status !== 0) {
                                    throw new Error("Matter attribute write was rejected");
                                }
                            } else if (definition.command === "invoke") {
                                const payload = parseBigIntAwareJson(value.trim() || "{}");
                                if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
                                    throw new Error("Command payload must be a JSON object");
                                }
                                if (definition.cluster === undefined || !definition.commandName) {
                                    throw new Error("Missing command metadata");
                                }
                                await client.deviceCommand(node.node_id, endpoint, definition.cluster,
                                    definition.commandName, Object.fromEntries(Object.entries(payload)),
                                    definition.timed ? { timedRequestTimeoutMs: 10000 } : undefined);
                            }
                        } catch (error) {
                            logger.error(`Matter command failed for node ${id} property ${definition.id}`, error);
                        }
                        return false;
                    },
                });
                properties.set(definition.path, { definition, property });
            }
        }
        platform.on("connect", () => {
            const latest = client.nodes[id];
            if (latest) publishNode({ platform, signature, properties }, latest, true);
        });
        return { platform, signature, properties };
    }

    function publishNode(instance: DeviceInstance, node: MatterNode, force = false) {
        publishDeviceStatus(instance.platform, connected && node.available ? DeviceStatus.ready : DeviceStatus.disconnected, force);
        for (const [path, { definition, property }] of instance.properties) {
            if (definition.command === "time-zone" &&
                storage.getItem(timeKey(String(node.node_id), definition.endpoint)) === unconfirmedTimeZone) continue;
            const value = propertyValue(definition, node.attributes[path]);
            if (value !== undefined) publishProperty(property, value, force);
            else if (node.attributes[path] === null) publishProperty(property, "", force);
        }
    }

    function markDisconnected() {
        connected = false;
        if (pairing.client) pairing.publishStatus(DeviceStatus.disconnected);
        for (const { platform } of devices.values()) {
            if (platform.client) publishDeviceStatus(platform, DeviceStatus.disconnected);
        }
    }

    function reconnect() {
        if (closing || reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = undefined;
            start();
        }, 5000);
    }

    function start() {
        if (closing || connectTask) return;
        connectTask = (async () => {
            try {
                await client.startListening();
                if (closing || !client.connection.connected) return;
                connected = true;
                pairing.publishStatus(DeviceStatus.ready);
                scheduleSync();
            } catch (error) {
                if (!closing) logger.error("Failed to connect to Matter Server", error);
                client.disconnect();
                client.connection.disconnect();
                markDisconnected();
                reconnect();
            } finally {
                connectTask = undefined;
            }
        })();
    }

    client.addEventListener("nodes_changed", scheduleSync);
    client.addNodeEventListener((event: MatterNodeEvent) => {
        if (closing || !connected) return;
        const id = String(event.node_id);
        const definition = mapEvent(event.endpoint_id, event.cluster_id, event.event_id);
        if (!definition) {
            logger.warning(`Unsupported Matter event ${event.endpoint_id}/${event.cluster_id}/${event.event_id} on node ${id}`);
            return;
        }
        let events = observedEvents.get(id);
        if (!events) {
            events = new Map();
            observedEvents.set(id, events);
        }
        events.set(definition.path, definition);
        enqueue(async () => {
            await syncDevices();
            const property = devices.get(id)?.properties.get(definition.path)?.property;
            if (!property || !connected) {
                logger.warning(`Could not forward Matter event on node ${id}`);
                return;
            }
            property.setValue(toBigIntAwareJson({
                event_number: event.event_number, timestamp: event.timestamp, timestamp_type: event.timestamp_type,
                data: event.data,
            }));
            property.value = undefined;
        });
    });
    client.addEventListener("connection_lost", () => {
        if (closing) return;
        markDisconnected();
        reconnect();
    });
    client.addEventListener("server_shutdown", () => {
        if (closing) return;
        markDisconnected();
        reconnect();
    });
    start();

    return {
        async cleanUp() {
            closing = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            for (const key of timeSchedules.keys()) stopTimeSchedule(key);
            client.disconnect();
            client.connection.disconnect();
            if (connectTask) await connectTask;
            await queue;
            await timeQueue;
            const platforms = [pairing, ...Array.from(devices.values(), (device) => device.platform)];
            const results = await Promise.allSettled(platforms.filter((platform) => platform.client).map((platform) => platform.disconnect()));
            const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
            if (errors.length) throw new AggregateError(errors, "Failed to disconnect Matter devices");
        },
        healthCheck() {
            return [pairing, ...Array.from(devices.values(), (device) => device.platform)].map((platform) => ({
                deviceId: platform.deviceId,
                connected: Boolean(platform.client && platform.client.connected && connected),
            }));
        },
    };
};
