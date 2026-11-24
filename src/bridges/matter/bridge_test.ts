import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import mqtt, { type MqttClient } from "mqtt";
import { logger as sdkLogger, type Logger } from "iot-platform/deno";
import { factory } from "../matter.ts";
import { endpointName, mapEvent, mapProperties, propertyValue } from "./mapping.ts";
import { MatterNode } from "@matter-server/ws-client";
import { matterTime, timeZoneSchedule } from "./time.ts";

const sensorData = {
    node_id: 1,
    date_commissioned: "",
    last_interview: "",
    interview_version: 6,
    available: true,
    is_bridge: false,
    attribute_subscriptions: [] as [],
    attributes: {
        "0/40/3": "ALPSTUGA",
        "0/47/12": 153,
        "0/56/65529": [0, 1, 2, 4, 5],
        "0/56/5": [{ "0": 0, "1": 0 }],
        "0/56/11": 2,
        "0/49/65529": [0, 1],
        "1/29/0": [{ "0": 44, "1": 1 }],
        "1/6/0": true,
        "1/6/65529": [0, 1, 2],
        "1/1026/0": 2439,
        "1/1026/1": -4000,
        "1/1026/2": 12500,
        "1/1026/3": 100,
        "1/1024/0": 10000,
        "1/1029/0": 5060,
        "1/1037/0": 2111,
        "1/1037/7": 0.1,
        "1/1037/8": 0,
        "1/1066/0": 5,
        "1/1066/8": 4,
        "2/513/0": 2150,
        "2/513/18": 2200,
        "2/513/28": 4,
        "2/513/80": [],
        "2/258/65529": [0, 1, 2, 5],
        "2/257/65529": [0, 1],
        "0/49/6": "network data",
    },
};

async function waitFor(condition: () => boolean, timeout = 3000) {
    const deadline = Date.now() + timeout;
    while (!condition()) {
        if (Date.now() > deadline) assert.fail("Timed out waiting for bridge event");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

Deno.test("maps discovered standard attributes, controls and their Matter metadata", () => {
    const properties = mapProperties(new MatterNode(sensorData));
    const byPath = (path: string) => {
        const property = properties.find((item) => item.path === path);
        assert.ok(property);
        return property;
    };
    assert.equal(propertyValue(byPath("1/1026/0"), 2439), "24.39");
    assert.equal(propertyValue(byPath("1/1026/0"), 2340), "23.4");
    assert.equal(propertyValue(byPath("1/1026/0"), -2340), "-23.4");
    assert.equal(propertyValue(byPath("1/1026/0"), 1), "0.01");
    assert.equal(propertyValue(byPath("0/47/12"), 153), "76.5");
    assert.equal(byPath("1/1026/0").name, "Temperature Measurement");
    assert.equal(byPath("1/1026/1").name, "Temperature Measurement - min");
    assert.equal(byPath("1/1026/2").name, "Temperature Measurement - max");
    assert.equal(byPath("1/1026/3").name, "Temperature Measurement");
    assert.equal(byPath("1/1024/0").name, "Illuminance Measurement");
    assert.equal(propertyValue(byPath("1/1029/0"), 5060), "50.6");
    assert.equal(byPath("1/1037/0").unit, "ppm");
    assert.equal(byPath("1/1037/7").name, "Carbon Dioxide Concentration Measurement - Uncertainty");
    assert.equal(byPath("1/1066/0").unit, "µg/m³");
    assert.equal(byPath("1/6/0").command, "onoff");
    assert.ok(!properties.some((item) => item.path.startsWith("1/6/command/")));
    assert.equal(propertyValue(byPath("1/1037/0"), null), undefined);
    assert.equal(byPath("2/513/18").command, "write");
    assert.equal(propertyValue(byPath("2/513/18"), 2200), "22");
    assert.equal(propertyValue(byPath("2/513/28"), 4), "Heat");
    assert.equal(byPath("2/258/command/5").commandName, "goToLiftPercentage");
    assert.equal(byPath("2/258/command/5").name, "Window Covering");
    assert.equal(byPath("2/513/80").atomic, true);
    assert.equal(mapProperties(new MatterNode(sensorData), 14).find((item) => item.path === "2/513/80")?.command, undefined);
    assert.ok(!properties.some((item) => item.path.startsWith("2/257/command/")));
    assert.ok(!properties.some((item) => item.path === "0/49/6"));
    assert.equal(byPath("0/56/command/0").name, "Sync time");
    assert.equal(byPath("0/56/5").format, "Europe/Prague,Europe/London,UTC");
    assert.equal(propertyValue(byPath("0/56/5"), [{ "2": "Europe/Prague" }]), "Europe/Prague");
    assert.ok(!properties.some((item) => item.path === "0/56/command/2" || item.path === "0/56/command/4"));
    assert.ok(!properties.some((item) => item.path === "0/56/command/1" || item.path === "0/56/command/5"));
    assert.ok(!properties.some((item) => item.path.startsWith("0/49/command/")));
    assert.equal(mapEvent(1, 59, 1)?.name, "Switch");
    const occupancy = mapProperties(new MatterNode({
        ...sensorData, attributes: { "1/1030/0": { "0": true } },
    }))[0];
    assert.equal(propertyValue(occupancy, { "0": true }), "true");
});

Deno.test("time controls require advertised commands", () => {
    const node = new MatterNode({ ...sensorData, attributes: { "0/56/65529": [0, 2] } });
    const properties = mapProperties(node);
    assert.ok(properties.some((item) => item.command === "sync-time"));
    assert.ok(!properties.some((item) => item.command === "time-zone"));
    const zoneOnly = new MatterNode({ ...sensorData, attributes: { "0/56/65529": [2, 4] } });
    assert.ok(mapProperties(zoneOnly).some((item) => item.command === "time-zone"));
    assert.ok(!mapProperties(zoneOnly).some((item) => item.command === "sync-time"));
});

Deno.test("endpoint names use reported device types and fall back for unknown descriptors", () => {
    const node = new MatterNode({
        ...sensorData,
        attributes: {
            "1/29/0": [{ "0": 44, "1": 1 }],
            "2/29/0": [{ deviceType: 256, revision: 1 }],
            "3/29/0": [{ "0": 18 }, { "0": 44 }],
            "4/29/0": [null, {}, { "0": 0xfff10001 }],
            "5/29/0": "invalid",
        },
    });
    assert.equal(endpointName(node, 1), "Air Quality Sensor");
    assert.equal(endpointName(node, 2), "On Off Light");
    assert.equal(endpointName(node, 3), "Air Quality Sensor");
    assert.equal(endpointName(node, 4), "Endpoint 4");
    assert.equal(endpointName(node, 5), "Endpoint 5");
    assert.equal(endpointName(node, 6), "Endpoint 6");
});

Deno.test("time zones use bounded DST intervals at spring and autumn transitions", () => {
    const spring = Date.parse("2025-03-30T01:00:00Z");
    const autumn = Date.parse("2025-10-26T01:00:00Z");
    for (const [zone, base] of [["Europe/Prague", 3600], ["Europe/London", 0]] as const) {
        const beforeSpring = timeZoneSchedule(zone, spring - 1000, 2);
        assert.equal(beforeSpring.standardOffset, base);
        assert.deepEqual(beforeSpring.dstOffset, [
            { offset: 0, validStarting: 0, validUntil: matterTime(spring) },
            { offset: 3600, validStarting: matterTime(spring), validUntil: matterTime(autumn) },
        ]);
        const afterSpring = timeZoneSchedule(zone, spring, 1);
        assert.deepEqual(afterSpring.dstOffset, [{ offset: 3600, validStarting: 0, validUntil: matterTime(autumn) }]);
        const afterAutumn = timeZoneSchedule(zone, autumn, 2);
        assert.equal(afterAutumn.dstOffset[0].offset, 0);
        assert.equal(afterAutumn.dstOffset[0].validUntil, matterTime(Date.parse("2026-03-29T01:00:00Z")));
        assert.equal(beforeSpring.refreshAt, spring + 1000);
    }
    const utc = timeZoneSchedule("UTC", spring, 1);
    assert.equal(utc.standardOffset, 0);
    assert.deepEqual(utc.dstOffset, [{ offset: 0, validStarting: 0, validUntil: null }]);
    assert.throws(() => timeZoneSchedule("UTC", spring, 0), /capacity/);
});

Deno.test("On/Off commands remain available when an endpoint has no on/off switch", () => {
    const node = new MatterNode({
        ...sensorData,
        attributes: {
            "1/6/0": true,
            "1/6/65529": [0, 1, 2, 66],
            "2/6/0": false,
            "2/6/65529": [0],
            "3/6/65529": [0, 1],
        },
    });
    const properties = mapProperties(node);
    assert.ok(properties.some((item) => item.path === "1/6/0" && item.command === "onoff"));
    assert.ok(!properties.some((item) => item.path.startsWith("1/6/command/")));
    assert.ok(properties.some((item) => item.path === "2/6/command/0"));
    assert.ok(properties.some((item) => item.path === "3/6/command/1"));
});

Deno.test({
    name: "discovers nodes, forwards updates and commands, commissions without logging the code, and reconnects",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        const sockets: WebSocket[] = [];
        const requests: { command: string; args: Record<string, unknown> }[] = [];
        let failTimeCommand = "";
        const abort = new AbortController();
        const server = Deno.serve({ port: 0, hostname: "127.0.0.1", signal: abort.signal, onListen: () => {} }, (request) => {
            const { socket, response } = Deno.upgradeWebSocket(request);
            socket.onopen = () => {
                sockets.push(socket);
                socket.send(JSON.stringify({ schema_version: 15, min_supported_schema_version: 11,
                    bluetooth_enabled: true, thread_credentials_set: true }));
            };
            socket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                requests.push(message);
                if (message.command === "device_command" && message.args.command_name === "setTimeZone") {
                    const zone = message.args.payload.timeZone[0];
                    socket.send(JSON.stringify({ event: "attribute_updated", data: [1, "0/56/5", [{ "0": zone.offset, "1": 0, "2": zone.name }]] }));
                }
                if (message.command === "device_command" && message.args.command_name === failTimeCommand) {
                    failTimeCommand = "";
                    socket.send(JSON.stringify({ message_id: message.message_id, error_code: 8, details: "rejected" }));
                    return;
                }
                if (message.command === "commission_with_code" && message.args.code === "bad-code") {
                    socket.send(JSON.stringify({ message_id: message.message_id, error_code: 8, details: "bad-code" }));
                    return;
                }
                let result: unknown = null;
                if (message.command === "start_listening") result = [sensorData];
                if (message.command === "commission_with_code") result = sensorData;
                if (message.command === "write_attribute") result = [{ Status: 0 }];
                if (message.command === "write_atomic_attribute") result = [{ Status: 0 }];
                socket.send(JSON.stringify({ message_id: message.message_id, result }));
            };
            return response;
        });

        const prototype = mqtt.MqttClient.prototype;
        const originals = { connect: prototype.connect, publish: prototype.publish, subscribe: prototype.subscribe,
            endAsync: prototype.endAsync, debug: sdkLogger.debug };
        const clients: MqttClient[] = [];
        const publications: { topic: string; value: string }[] = [];
        const debug: string[] = [];
        const errors: string[] = [];
        const log: Logger = {
            info: () => [], warning: () => [], silly: () => [],
            error: (...args) => { errors.push(args.join(" ")); return []; },
            debug: (...args) => { debug.push(args.join(" ")); return []; },
        };
        prototype.connect = function () { this.connected = true; clients.push(this); return this; };
        prototype.publish = function (topic, value) {
            publications.push({ topic, value: value.toString() });
            return this;
        };
        prototype.subscribe = function () { return this; };
        prototype.endAsync = async function () { this.connected = false; this.disconnected = true; };
        sdkLogger.debug = (...args) => { debug.push(args.join(" ")); return []; };
        let bridge: Awaited<ReturnType<typeof factory>> | undefined;
        const stored = new Map<string, string>();
        try {
            bridge = await factory(
                { userName: "test", mqtt: { uri: "mqtt://localhost", port: 1883 } },
                { id: "matter", name: "Matter", type: "matter", matterUrl: `ws://127.0.0.1:${server.addr.port}/ws` },
                log, {
                    getItem: (key) => key.includes("-matter-timezone-") ? stored.get(key) || null : JSON.stringify({ apiKey: "test" }),
                    setItem: (key, value) => { stored.set(key, value); },
                    removeItem: (key) => { stored.delete(key); },
                },
            );
            await waitFor(() => clients.length === 2);
            await waitFor(() => publications.some((p) => p.topic.endsWith("/e1-c1037-a0") && p.value === "2111"));
            assert.ok(publications.some((p) => p.topic === "v2/test/matter-matter-1/endpoint1/$name" &&
                p.value === "Air Quality Sensor"));
            assert.ok(publications.some((p) => p.topic === "v2/test/matter-matter-1/endpoint2/$name" &&
                p.value === "Endpoint 2"));
            assert.ok(!publications.some((p) => p.topic.includes("/endpoint1/e1-c6-cmd")));
            const device = clients.find((client) => client.options.clientId === "mqttjs_matter-matter-1");
            const pairing = clients.find((client) => client.options.clientId === "mqttjs_matter");
            assert.ok(device);
            assert.ok(pairing);
            const temperatureTopic = "v2/test/matter-matter-1/endpoint1/e1-c1026-a0";
            const humidityTopic = "v2/test/matter-matter-1/endpoint1/e1-c1029-a0";
            const stateTopic = "v2/test/matter-matter-1/$state";
            const count = (topic: string) => publications.filter((p) => p.topic === topic).length;
            const update = async (path: string, value: unknown) => {
                const states = count(stateTopic);
                sockets[0].send(JSON.stringify({ event: "attribute_updated", data: [1, path, value] }));
                await waitFor(() => count(stateTopic) > states);
            };
            let now = performance.now() + 1000;
            Object.defineProperty(performance, "now", { value: () => now, configurable: true });
            try {
                await update("1/1026/0", 2340);
                now += 10_000;
                await update("1/1029/0", 5070);
                const temperatureCount = count(temperatureTopic);
                const humidityCount = count(humidityTopic);
                now += 49_999;
                await update("1/1026/0", 2340);
                assert.equal(count(temperatureTopic), temperatureCount);
                assert.equal(count(humidityTopic), humidityCount);
                now += 1;
                await update("1/1026/0", 2340);
                assert.equal(count(temperatureTopic), temperatureCount + 1);
                assert.equal(count(humidityTopic), humidityCount);
                now += 10_000;
                await update("1/1029/0", 5070);
                assert.equal(count(temperatureTopic), temperatureCount + 1);
                assert.equal(count(humidityTopic), humidityCount + 1);
                await update("1/1026/0", 2341);
                assert.equal(publications.filter((p) => p.topic === temperatureTopic).at(-1)?.value, "23.41");
                assert.equal(count(temperatureTopic), temperatureCount + 2);
                await update("1/1026/0", null);
                assert.equal(publications.filter((p) => p.topic === temperatureTopic).at(-1)?.value, "");
                await update("1/1026/0", null);
                assert.equal(count(temperatureTopic), temperatureCount + 3);
                await update("1/1026/0", 2340);
                assert.equal(count(temperatureTopic), temperatureCount + 4);
            } finally {
                Reflect.deleteProperty(performance, "now");
            }
            const packet = { cmd: "publish" as const, topic: "", payload: Buffer.alloc(0), qos: 0 as const, dup: false, retain: false };
            const syncTopic = "v2/test/matter-matter-1/endpoint0-sync-time/power/set";
            const zoneTopic = "v2/test/matter-matter-1/endpoint0-sync-time/e0-c56-timezone/set";
            assert.ok(publications.some((p) => p.topic === "v2/test/matter-matter-1/endpoint0-sync-time/$type" &&
                p.value === "activator"));
            const timeProperties = publications.find((p) => p.topic === "v2/test/matter-matter-1/endpoint0-sync-time/$properties");
            assert.ok(timeProperties);
            assert.deepEqual(new Set(timeProperties.value.split(",")), new Set(["power", "e0-c56-timezone"]));
            const otherProperties = publications.find((p) => p.topic === "v2/test/matter-matter-1/endpoint0/$properties");
            assert.ok(otherProperties);
            assert.equal(otherProperties.value, "e0-c47-a12");
            assert.ok(publications.some((p) => p.topic === syncTopic.replace(/\/set$/, "/$name") && p.value === "Sync time"));
            assert.ok(publications.some((p) => p.topic === zoneTopic.replace(/\/set$/, "/$format") &&
                p.value === "Europe/Prague,Europe/London,UTC"));
            const before = matterTime(Date.now());
            device.emit("message", syncTopic, Buffer.from("on"), packet);
            await waitFor(() => requests.some((request) => request.args.command_name === "setUtcTime"));
            const utcRequest = requests.find((request) => request.args.command_name === "setUtcTime")!;
            assert.equal(utcRequest.args.endpoint_id, 0);
            assert.equal(utcRequest.args.cluster_id, 56);
            const utcPayload = utcRequest.args.payload as { utcTime: number; granularity: number };
            assert.ok(utcPayload.utcTime >= before && utcPayload.utcTime <= matterTime(Date.now()));
            assert.equal(utcPayload.granularity, 2);
            device.emit("message", zoneTopic, Buffer.from("invalid"), packet);
            await waitFor(() => errors.some((line) => line.includes("Invalid time zone")));
            assert.ok(!requests.some((request) => request.args.command_name === "setTimeZone"));
            device.emit("message", zoneTopic, Buffer.from("Europe/Prague"), packet);
            await waitFor(() => publications.some((p) => p.topic === zoneTopic.replace(/\/set$/, "") && p.value === "Europe/Prague"));
            const zoneRequest = requests.find((request) => request.args.command_name === "setTimeZone")!;
            assert.deepEqual(zoneRequest.args.payload, { timeZone: [{ offset: 3600, validAt: 0, name: "Europe/Prague" }] });
            const dstRequest = requests.find((request) => request.args.command_name === "setDstOffset")!;
            assert.equal((dstRequest.args.payload as { dstOffset: unknown[] }).dstOffset.length, 2);
            assert.equal(stored.get("matter-matter-timezone-1-0"), "Europe/Prague");
            failTimeCommand = "setDstOffset";
            device.emit("message", zoneTopic, Buffer.from("UTC"), packet);
            await waitFor(() => errors.some((line) => line.includes("rejected")));
            assert.ok(!publications.some((p) => p.topic === zoneTopic.replace(/\/set$/, "") && p.value === "UTC"));
            assert.equal(stored.get("matter-matter-timezone-1-0"), "unconfirmed");
            device.emit("message", zoneTopic, Buffer.from("UTC"), packet);
            await waitFor(() => publications.some((p) => p.topic === zoneTopic.replace(/\/set$/, "") && p.value === "UTC"));
            const utcDst = requests.filter((request) => request.args.command_name === "setDstOffset").at(-1)!;
            assert.deepEqual(utcDst.args.payload, { dstOffset: [{ offset: 0, validStarting: 0, validUntil: null }] });
            const errorsBeforeZoneFailure = errors.length;
            const dstBeforeZoneFailure = requests.filter((request) => request.args.command_name === "setDstOffset").length;
            failTimeCommand = "setTimeZone";
            device.emit("message", zoneTopic, Buffer.from("Europe/London"), packet);
            await waitFor(() => errors.length > errorsBeforeZoneFailure);
            assert.equal(requests.filter((request) => request.args.command_name === "setDstOffset").length, dstBeforeZoneFailure);
            assert.ok(!publications.some((p) => p.topic === zoneTopic.replace(/\/set$/, "") && p.value === "Europe/London"));
            device.emit("message", zoneTopic, Buffer.from("Europe/London"), packet);
            await waitFor(() => publications.some((p) => p.topic === zoneTopic.replace(/\/set$/, "") && p.value === "Europe/London"));
            assert.equal(stored.get("matter-matter-timezone-1-0"), "Europe/London");
            device.emit("message", "v2/test/matter-matter-1/endpoint1/e1-c6-a0/set", Buffer.from("false"), packet);
            await waitFor(() => requests.some((request) => request.args.command_name === "off"));
            device.emit("message", "v2/test/matter-matter-1/endpoint2/e2-c513-a18/set", Buffer.from("23.5"), packet);
            await waitFor(() => requests.some((request) => request.command === "write_attribute"));
            assert.equal(requests.find((request) => request.command === "write_attribute")?.args.value, 2350);
            device.emit("message", "v2/test/matter-matter-1/endpoint2/e2-c513-a18/set", Buffer.from("23.501"), packet);
            await waitFor(() => errors.some((line) => line.includes("exceeds Matter precision")));
            assert.equal(requests.filter((request) => request.command === "write_attribute").length, 1);
            device.emit("message", "v2/test/matter-matter-1/endpoint2/e2-c513-a80/set", Buffer.from("[]"), packet);
            await waitFor(() => requests.some((request) => request.command === "write_atomic_attribute"));
            assert.equal(requests.find((request) => request.command === "write_atomic_attribute")?.args.skip_data_version_check, true);
            device.emit("message", "v2/test/matter-matter-1/endpoint2/e2-c258-cmd5/set",
                Buffer.from('{"liftPercent100thsValue":5000}'), packet);
            await waitFor(() => requests.some((request) => request.args.command_name === "goToLiftPercentage"));

            const secret = "MT:TEST-PAIRING-CODE";
            pairing.emit("message", "v2/test/matter/pairing/code/set", Buffer.from(secret), { ...packet, retain: true });
            assert.equal(requests.filter((request) => request.command === "commission_with_code").length, 0);
            assert.ok(errors.some((line) => line.includes("Ignoring retained")));
            pairing.emit("message", "v2/test/matter/pairing/code/set", Buffer.from(secret), packet);
            await waitFor(() => requests.some((request) => request.command === "commission_with_code"));
            await waitFor(() => publications.some((p) => p.topic.endsWith("/pairing/status") && p.value === "Commissioned"));
            assert.equal(requests.find((request) => request.command === "commission_with_code")?.args.code, secret);
            assert.ok(!publications.some((p) => p.value.includes(secret)));
            assert.ok(!debug.some((line) => line.includes(secret)));
            pairing.emit("message", "v2/test/matter/pairing/code/set", Buffer.from("bad-code"), packet);
            await waitFor(() => publications.some((p) => p.value.startsWith("Commissioning failed")));
            assert.ok(!errors.some((line) => line.includes("bad-code")));

            sockets[0].send(JSON.stringify({ event: "attribute_updated", data: [1, "1/1026/0", 2340] }));
            await waitFor(() => publications.some((p) => p.topic.endsWith("/e1-c1026-a0") && p.value === "23.4"));
            sockets[0].send(JSON.stringify({ event: "attribute_updated", data: [1, "1/1026/0", 2600] }));
            await waitFor(() => publications.some((p) => p.topic.endsWith("/e1-c1026-a0") && p.value === "26"));
            sockets[0].send(JSON.stringify({ event: "node_added", data: { ...sensorData, node_id: 2 } }));
            await waitFor(() => clients.some((client) => client.options.clientId === "mqttjs_matter-matter-2"));
            sockets[0].send(JSON.stringify({ event: "attribute_updated", data: [2, "1/29/0", [{ "0": 256, "1": 1 }]] }));
            await waitFor(() => publications.some((p) => p.topic === "v2/test/matter-matter-2/endpoint1/$name" &&
                p.value === "On Off Light"));
            sockets[0].send(JSON.stringify({ event: "node_event", data: {
                node_id: 2, endpoint_id: 1, cluster_id: 59, event_id: 1, event_number: 1,
                priority: 1, timestamp: 123, timestamp_type: 1, data: { newPosition: 1 },
            } }));
            await waitFor(() => publications.some((p) => p.topic.endsWith("/e1-c59-event1")));
            const added = clients.filter((client) => client.options.clientId === "mqttjs_matter-matter-2").at(-1)!;
            const eventCount = publications.filter((p) => p.topic.endsWith("/e1-c59-event1")).length;
            sockets[0].send(JSON.stringify({ event: "node_event", data: {
                node_id: 2, endpoint_id: 1, cluster_id: 59, event_id: 1, event_number: 1,
                priority: 1, timestamp: 123, timestamp_type: 1, data: { newPosition: 1 },
            } }));
            await waitFor(() => publications.filter((p) => p.topic.endsWith("/e1-c59-event1")).length === eventCount + 1);
            added.emit("connect", { cmd: "connack", sessionPresent: false, returnCode: 0 });
            assert.equal(publications.filter((p) => p.topic.endsWith("/e1-c59-event1")).length, eventCount + 1);
            sockets[0].send(JSON.stringify({ event: "node_removed", data: 2 }));
            await waitFor(() => added.disconnected);
            for (const [nodeId, commands, type, properties] of [
                [3, [0], "activator", "power"],
                [4, [2, 4], "generic", "e0-c56-timezone"],
            ] as const) {
                sockets[0].send(JSON.stringify({ event: "node_added", data: {
                    ...sensorData, node_id: nodeId, attributes: { "0/56/65529": commands },
                } }));
                const prefix = `v2/test/matter-matter-${nodeId}`;
                await waitFor(() => publications.some((p) => p.topic === `${prefix}/endpoint0-sync-time/$properties`));
                assert.ok(publications.some((p) => p.topic === `${prefix}/$nodes` && p.value === "endpoint0-sync-time"));
                assert.ok(publications.some((p) => p.topic === `${prefix}/endpoint0-sync-time/$type` && p.value === type));
                assert.ok(publications.some((p) => p.topic === `${prefix}/endpoint0-sync-time/$properties` && p.value === properties));
                sockets[0].send(JSON.stringify({ event: "node_removed", data: nodeId }));
                const addedTimeNode = clients.find((client) => client.options.clientId === `mqttjs_matter-matter-${nodeId}`);
                assert.ok(addedTimeNode);
                await waitFor(() => addedTimeNode.disconnected);
            }
            sockets[0].close();
            await waitFor(() => sockets.length === 2, 7000);
            const statesBeforeReconnect = count(stateTopic);
            await waitFor(() => count(stateTopic) > statesBeforeReconnect);
            assert.equal(clients.filter((client) => client.options.clientId === "mqttjs_matter-matter-1").length, 1);
            const temperaturesBeforeReconnect = count(temperatureTopic);
            device.emit("connect", { cmd: "connack", sessionPresent: false, returnCode: 0 });
            assert.equal(count(temperatureTopic), temperaturesBeforeReconnect + 1);
            await bridge.cleanUp();
            bridge = undefined;
            const dstCount = requests.filter((request) => request.args.command_name === "setDstOffset").length;
            const zoneCount = requests.filter((request) => request.args.command_name === "setTimeZone").length;
            bridge = await factory(
                { userName: "test", mqtt: { uri: "mqtt://localhost", port: 1883 } },
                { id: "matter", name: "Matter", type: "matter", matterUrl: `ws://127.0.0.1:${server.addr.port}/ws` },
                log, {
                    getItem: (key) => key.includes("-matter-timezone-") ? stored.get(key) || null : JSON.stringify({ apiKey: "test" }),
                    setItem: (key, value) => { stored.set(key, value); },
                    removeItem: (key) => { stored.delete(key); },
                },
            );
            await waitFor(() => requests.filter((request) => request.args.command_name === "setDstOffset").length > dstCount);
            assert.equal(requests.filter((request) => request.args.command_name === "setTimeZone").length, zoneCount);
        } finally {
            if (bridge) await bridge.cleanUp();
            for (const socket of sockets) socket.close();
            abort.abort();
            await server.finished;
            prototype.connect = originals.connect;
            prototype.publish = originals.publish;
            prototype.subscribe = originals.subscribe;
            prototype.endAsync = originals.endAsync;
            sdkLogger.debug = originals.debug;
        }
    },
});
