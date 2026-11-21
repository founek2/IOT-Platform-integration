import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import mqtt, { type MqttClient } from "mqtt";
import { logger as sdkLogger, type Logger } from "iot-platform/deno";
import { factory } from "../matter.ts";
import { mapEvent, mapProperties, propertyValue } from "./mapping.ts";
import { MatterNode } from "@matter-server/ws-client";

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
        "1/6/0": true,
        "1/6/65529": [0, 1, 2],
        "1/1026/0": 2439,
        "1/1029/0": 5060,
        "1/1037/0": 2111,
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
    assert.equal(propertyValue(byPath("1/1029/0"), 5060), "50.6");
    assert.equal(byPath("1/1037/0").unit, "ppm");
    assert.equal(byPath("1/1066/0").unit, "µg/m³");
    assert.equal(byPath("1/6/0").command, "onoff");
    assert.equal(propertyValue(byPath("1/1037/0"), null), undefined);
    assert.equal(byPath("2/513/18").command, "write");
    assert.equal(propertyValue(byPath("2/513/18"), 2200), "22");
    assert.equal(propertyValue(byPath("2/513/28"), 4), "Heat");
    assert.equal(byPath("2/258/command/5").commandName, "goToLiftPercentage");
    assert.equal(byPath("2/513/80").atomic, true);
    assert.equal(mapProperties(new MatterNode(sensorData), 14).find((item) => item.path === "2/513/80")?.command, undefined);
    assert.ok(!properties.some((item) => item.path.startsWith("2/257/command/")));
    assert.ok(!properties.some((item) => item.path === "0/49/6"));
    assert.equal(mapEvent(1, 59, 1)?.name, "Switch - Initial Press (event)");
    const occupancy = mapProperties(new MatterNode({
        ...sensorData, attributes: { "1/1030/0": { "0": true } },
    }))[0];
    assert.equal(propertyValue(occupancy, { "0": true }), "true");
});

Deno.test({
    name: "discovers nodes, forwards updates and commands, commissions without logging the code, and reconnects",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        const sockets: WebSocket[] = [];
        const requests: { command: string; args: Record<string, unknown> }[] = [];
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
        try {
            bridge = await factory(
                { userName: "test", mqtt: { uri: "mqtt://localhost", port: 1883 } },
                { id: "matter", name: "Matter", type: "matter", matterUrl: `ws://127.0.0.1:${server.addr.port}/ws` },
                log, { getItem: () => JSON.stringify({ apiKey: "test" }), setItem: () => {}, removeItem: () => {} },
            );
            await waitFor(() => clients.length === 2);
            await waitFor(() => publications.some((p) => p.topic.endsWith("/e1-c1037-a0") && p.value === "2111"));
            const device = clients.find((client) => client.options.clientId === "mqttjs_matter-matter-1");
            const pairing = clients.find((client) => client.options.clientId === "mqttjs_matter");
            assert.ok(device);
            assert.ok(pairing);
            const packet = { cmd: "publish" as const, topic: "", payload: Buffer.alloc(0), qos: 0 as const, dup: false, retain: false };
            device.emit("message", "v2/test/matter-matter-1/endpoint1/e1-c6-a0/set", Buffer.from("false"), packet);
            await waitFor(() => requests.some((request) => request.command === "device_command"));
            assert.equal(requests.find((request) => request.command === "device_command")?.args.command_name, "off");
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

            sockets[0].send(JSON.stringify({ event: "attribute_updated", data: [1, "1/1026/0", 2600] }));
            await waitFor(() => publications.some((p) => p.topic.endsWith("/e1-c1026-a0") && p.value === "26"));
            sockets[0].send(JSON.stringify({ event: "node_added", data: { ...sensorData, node_id: 2 } }));
            await waitFor(() => clients.some((client) => client.options.clientId === "mqttjs_matter-matter-2"));
            sockets[0].send(JSON.stringify({ event: "node_event", data: {
                node_id: 2, endpoint_id: 1, cluster_id: 59, event_id: 1, event_number: 1,
                priority: 1, timestamp: 123, timestamp_type: 1, data: { newPosition: 1 },
            } }));
            await waitFor(() => publications.some((p) => p.topic.endsWith("/e1-c59-event1")));
            const added = clients.filter((client) => client.options.clientId === "mqttjs_matter-matter-2").at(-1)!;
            const eventCount = publications.filter((p) => p.topic.endsWith("/e1-c59-event1")).length;
            added.emit("connect", { cmd: "connack", sessionPresent: false, returnCode: 0 });
            assert.equal(publications.filter((p) => p.topic.endsWith("/e1-c59-event1")).length, eventCount);
            sockets[0].send(JSON.stringify({ event: "node_removed", data: 2 }));
            await waitFor(() => added.disconnected);
            sockets[0].close();
            await waitFor(() => sockets.length === 2, 7000);
            await waitFor(() => publications.filter((p) => p.topic.endsWith("/e1-c1037-a0") && p.value === "2111").length >= 2);
            assert.equal(clients.filter((client) => client.options.clientId === "mqttjs_matter-matter-1").length, 1);
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
