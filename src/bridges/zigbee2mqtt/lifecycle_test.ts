import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import mqtt, { type MqttClient } from "mqtt";
import * as deepl from "deepl-node";
import { type Logger } from "iot-platform/deno";
import { factory } from "../zigbee2mqtt.ts";

function device(id: string, model = "model") {
    return {
        ieee_address: id,
        friendly_name: id,
        definition: {
            model,
            vendor: "vendor",
            description: "description",
            exposes: [{
                type: "numeric",
                name: "temperature",
                label: "Temperature",
                property: "temperature",
                access: 3,
            }],
        },
    };
}

async function waitFor(condition: () => boolean) {
    for (let attempt = 0; attempt < 500; attempt++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.fail("Timed out waiting for bridge lifecycle event");
}

interface Hooks {
    translate?: () => Promise<void>;
    end?: (client: MqttClient) => void | Promise<void>;
    publish?: (client: MqttClient, topic: string) => void;
    prefix?: string;
    guest?: boolean;
    publishError?: Error;
}

async function withBridge(
    hooks: Hooks,
    test: (context: {
        bridge: Awaited<ReturnType<typeof factory>>;
        send: (devices: ReturnType<typeof device>[]) => void;
        message: (topic: string, payload: unknown) => void;
        clients: MqttClient[];
        errors: unknown[][];
        debug: unknown[][];
        publications: { client: MqttClient; topic: string; payload: string }[];
        events: string[];
        conflicts: string[];
    }) => Promise<void>,
) {
    const prototype = mqtt.MqttClient.prototype;
    const originals = {
        connect: prototype.connect,
        publish: prototype.publish,
        subscribe: prototype.subscribe,
        end: prototype.end,
        endAsync: prototype.endAsync,
        translate: Object.getOwnPropertyDescriptor(deepl.Translator.prototype, "translateText")!,
    };
    const clients: MqttClient[] = [];
    const events: string[] = [];
    const conflicts: string[] = [];
    const publications: { client: MqttClient; topic: string; payload: string }[] = [];
    const errors: unknown[][] = [];
    const debug: unknown[][] = [];
    const logger: Logger = {
        info: () => [],
        warning: (...args) => { debug.push(args); return []; },
        silly: () => [],
        error: (...args) => { errors.push(args); return []; },
        debug: (...args) => { debug.push(args); return []; },
    };

    prototype.connect = function () {
        const id = this.options.clientId!;
        if (clients.some((client) => client.connected && client.options.clientId === id)) {
            conflicts.push(id);
        }
        this.connected = true;
        clients.push(this);
        events.push(`connect:${id}`);
        return this;
    };
    prototype.publish = function (
        topic: string,
        payload: string | Buffer,
        options?: Parameters<MqttClient["publish"]>[2] | Parameters<MqttClient["publish"]>[3],
        callback?: Parameters<MqttClient["publish"]>[3],
    ) {
        publications.push({ client: this, topic, payload: payload.toString() });
        hooks.publish?.(this, topic);
        const done = typeof options === "function" ? options : callback;
        if (done) done(topic.endsWith("/bridge/request/permit_join") ? hooks.publishError : undefined);
        return this;
    };
    prototype.subscribe = function () { return this; };
    prototype.end = function () {
        this.connected = false;
        this.disconnected = true;
        return this;
    };
    prototype.endAsync = async function () {
        await hooks.end?.(this);
        this.connected = false;
        this.disconnected = true;
        events.push(`end:${this.options.clientId}`);
    };
    Object.defineProperty(deepl.Translator.prototype, "translateText", {
        configurable: true,
        writable: true,
        value: async (text: string) => {
            await hooks.translate?.();
            return { text, detectedSourceLang: "en" };
        },
    });

    let bridge: Awaited<ReturnType<typeof factory>> | undefined;
    try {
        const prefix = hooks.prefix || "zigbee2mqtt";
        bridge = await factory(
            { userName: "test", mqtt: { uri: "mqtt://localhost", port: 1883 } },
            {
                id: "zigbee",
                name: "Zigbee",
                type: "zigbee2mqtt",
                deeplApiKey: "test-api-key:fx",
                zigbeeMqtt: { uri: "mqtt://localhost", port: 1883, prefix },
            },
            logger,
            {
                getItem: () => hooks.guest ? null : JSON.stringify({ apiKey: "test" }),
                setItem: () => {},
                removeItem: () => {},
            },
        );
        const message = (topic: string, payload: unknown) => {
            clients[0].emit("message", topic, Buffer.from(JSON.stringify(payload)), {
                cmd: "publish", topic, payload: Buffer.alloc(0), qos: 0, dup: false, retain: false,
            });
        };
        message(`${prefix}/bridge/state`, { state: "online" });
        await test({
            bridge,
            send: (devices) => message(`${prefix}/bridge/devices`, devices),
            message, clients, errors, debug, publications, events, conflicts,
        });
    } finally {
        try {
            await bridge?.cleanUp();
        } finally {
            prototype.connect = originals.connect;
            prototype.publish = originals.publish;
            prototype.subscribe = originals.subscribe;
            prototype.end = originals.end;
            prototype.endAsync = originals.endAsync;
            Object.defineProperty(deepl.Translator.prototype, "translateText", originals.translate);
        }
    }
}

Deno.test("devices initialize in parallel while rebuilds remain sequential", async () => {
    const gate = Promise.withResolvers<void>();
    let translations = 0;
    await withBridge({
        translate: async () => {
            if (++translations === 1) await gate.promise;
        },
    }, async ({ bridge, send, clients, debug, conflicts }) => {
        send([device("one"), device("two")]);
        try {
            await waitFor(() => clients.some((client) => client.options.clientId === "mqttjs_two"));
            assert.equal(translations, 2);
            assert(!clients.some((client) => client.options.clientId === "mqttjs_one"));
            send([device("one", "updated"), device("two", "updated")]);
            await new Promise((resolve) => setTimeout(resolve, 20));
            assert.equal(translations, 2);
        } finally {
            gate.resolve();
        }
        await waitFor(() => debug.filter(([text]) => text === "Refreshing devices").length === 2 && clients.length === 6);
        await bridge.cleanUp();
        assert(clients.every((client) => !client.connected));
        assert.deepEqual(conflicts, []);
    });
});

Deno.test("failed parallel builds wait for pending devices before cleanup", async () => {
    const gate = Promise.withResolvers<void>();
    let translations = 0;
    let failed = false;
    await withBridge({
        translate: async () => {
            if (++translations === 3) await gate.promise;
        },
        publish: (client) => {
            if (!failed && client.options.clientId === "mqttjs_two") {
                failed = true;
                throw new Error("Initialization failed");
            }
        },
    }, async ({ bridge, send, clients, errors, events, conflicts }) => {
        send([device("one"), device("two"), device("three")]);
        try {
            await waitFor(() => failed && translations === 3);
            await new Promise((resolve) => setTimeout(resolve, 20));
            assert.equal(errors.length, 0);
            assert(!events.some((event) => event.startsWith("end:")));
            send([device("one"), device("two"), device("three")]);
        } finally {
            gate.resolve();
        }
        await waitFor(() => errors.length === 1 && clients.length === 8);
        assert(events.indexOf("end:mqttjs_three") < events.lastIndexOf("connect:mqttjs_one"));
        await bridge.cleanUp();
        assert(clients.every((client) => !client.connected));
        assert.deepEqual(conflicts, []);
    });
});

Deno.test("device updates rebuild sequentially and skip queued identical lists", async () => {
    const gate = Promise.withResolvers<void>();
    let translations = 0;
    await withBridge({
        translate: async () => {
            if (++translations === 2) await gate.promise;
        },
    }, async ({ bridge, send, message, clients, debug, errors, events, conflicts, publications }) => {
        send([device("one"), device("two")]);
        await waitFor(() => translations === 2);
        send([device("one", "updated"), device("two", "updated")]);
        send([device("one", "updated"), device("two", "updated")]);
        message("zigbee2mqtt/two/availability", { state: "offline" });
        try {
            await new Promise((resolve) => setTimeout(resolve, 20));
            assert.equal(translations, 2, "Queued rebuilds must not start while a build is blocked");
        } finally {
            gate.resolve();
        }
        await waitFor(() => debug.some(([text]) => text === "Fingerprint matches, skipping refresh"));

        assert.deepEqual(events.slice(2), [
            "connect:mqttjs_one", "connect:mqttjs_two",
            "end:mqttjs_one", "end:mqttjs_two",
            "connect:mqttjs_one", "connect:mqttjs_two",
        ]);
        assert.equal(clients.length, 6);
        assert.deepEqual(conflicts, []);
        assert.deepEqual(errors, []);
        assert.deepEqual(bridge.healthCheck(), [
            { deviceId: "zigbee", connected: true },
            { deviceId: "one", connected: true },
            { deviceId: "two", connected: true },
        ]);
        assert.equal(publications.filter(({ topic }) => topic === "v2/test/two/$state").at(-1)?.payload, "disconnected");

        message("zigbee2mqtt/one", { temperature: 22 });
        assert.equal(publications.at(-1)?.topic, "v2/test/one/node/temperature");
        assert.equal(publications.at(-1)?.payload, "22");
        clients[4].emit("message", "v2/test/one/node/temperature/set", Buffer.from("25"), {
            cmd: "publish", topic: "v2/test/one/node/temperature/set",
            payload: Buffer.from("25"), qos: 0, dup: false, retain: false,
        });
        assert.equal(publications.at(-1)?.topic, "zigbee2mqtt/one/set");
        assert.equal(publications.at(-1)?.payload, '{"temperature":25}');
    });
});

Deno.test("a failed partial build is disconnected and an identical update retries", async () => {
    let fail = true;
    await withBridge({
        publish: (client) => {
            if (fail && client.options.clientId === "mqttjs_two") {
                fail = false;
                throw new Error("Initialization failed");
            }
        },
    }, async ({ bridge, send, clients, errors, conflicts }) => {
        send([device("one"), device("two")]);
        await waitFor(() => errors.length === 1);
        assert.equal(clients.length, 4);
        assert(clients.slice(2).every((client) => !client.connected));
        assert.deepEqual(bridge.healthCheck(), [{ deviceId: "zigbee", connected: true }]);

        send([device("one"), device("two")]);
        await waitFor(() => clients.length === 6);
        await bridge.cleanUp();
        assert(clients.every((client) => !client.connected));
        assert.deepEqual(conflicts, []);
    });
});

Deno.test("shutdown waits for an active build, drops queued updates and ignores new messages", async () => {
    const gate = Promise.withResolvers<void>();
    let translations = 0;
    await withBridge({
        translate: async () => {
            if (++translations === 2) await gate.promise;
        },
    }, async ({ bridge, send, clients, errors }) => {
        send([device("one"), device("two")]);
        await waitFor(() => translations === 2);
        send([device("three")]);
        let closed = false;
        const cleanup = Promise.resolve(bridge.cleanUp()).then(() => { closed = true; });
        send([device("four")]);
        assert.equal(closed, false);
        assert.equal(clients[0].connected, true);
        gate.resolve();
        await cleanup;
        await bridge.cleanUp();
        assert.equal(clients.length, 4);
        assert(clients.every((client) => !client.connected));
        assert.deepEqual(errors, []);
    });
});

Deno.test("failed partial-build cleanup keeps clients tracked for the next retry", async () => {
    let failBuild = true;
    let failCleanup = true;
    await withBridge({
        publish: (client) => {
            if (failBuild && client.options.clientId === "mqttjs_two") {
                failBuild = false;
                throw new Error("Initialization failed");
            }
        },
        end: (client) => {
            if (failCleanup && client.options.clientId === "mqttjs_one") {
                throw new Error("Cleanup failed");
            }
        },
    }, async ({ bridge, send, clients, errors, conflicts }) => {
        send([device("one"), device("two")]);
        await waitFor(() => errors.length === 1);
        assert(errors[0][1] instanceof AggregateError);
        assert.equal(clients[2].connected, true);
        assert.equal(clients[3].connected, false);
        assert.deepEqual(bridge.healthCheck(), [
            { deviceId: "zigbee", connected: true },
            { deviceId: "one", connected: true },
            { deviceId: "two", connected: false },
        ]);

        failCleanup = false;
        send([device("one"), device("two")]);
        await waitFor(() => clients.length === 6);
        await bridge.cleanUp();
        assert(clients.every((client) => !client.connected));
        assert.deepEqual(conflicts, []);
    });
});

Deno.test("a failed disconnect prevents replacement clients until a later successful retry", async () => {
    let fail = true;
    let secondClosing = false;
    const gate = Promise.withResolvers<void>();
    await withBridge({
        end: async (client) => {
            if (fail && client.options.clientId === "mqttjs_one") {
                throw new Error("Disconnect failed");
            }
            if (client.options.clientId === "mqttjs_two") {
                secondClosing = true;
                await gate.promise;
            }
        },
    }, async ({ bridge, send, clients, errors, events, conflicts }) => {
        send([device("one"), device("two")]);
        await waitFor(() => clients.length === 4);
        send([device("one", "updated"), device("two", "updated")]);
        await waitFor(() => secondClosing);
        try {
            assert.equal(errors.length, 0, "Shutdown must settle every client before reporting failure");
            assert.equal(clients.length, 4);
        } finally {
            gate.resolve();
        }
        await waitFor(() => errors.length === 1);
        assert.equal(clients.length, 4);
        assert(events.includes("end:mqttjs_two"));

        fail = false;
        send([device("one"), device("two")]);
        await waitFor(() => clients.length === 6);
        await bridge.cleanUp();
        assert(clients.every((client) => !client.connected));
        assert.deepEqual(conflicts, []);
    });
});

Deno.test("malformed device lists are logged without blocking the next rebuild", async () => {
    await withBridge({}, async ({ bridge, send, message, clients, errors }) => {
        message("zigbee2mqtt/bridge/devices", null);
        send([device("one")]);
        await waitFor(() => clients.length === 3);
        await bridge.cleanUp();
        assert.equal(errors.length, 1);
        assert.equal(errors[0][0], "Failed to refresh Zigbee devices");
    });
});

function setPairing(client: MqttClient, value: string) {
    const topic = "v2/test/zigbee/pairing/power/set";
    client.emit("message", topic, Buffer.from(value), {
        cmd: "publish", topic, payload: Buffer.from(value), qos: 0, dup: false, retain: false,
    });
}

Deno.test("pairing switch follows Zigbee2MQTT state across requests, expiry and rebuilds", async () => {
    await withBridge({ prefix: "custom/zigbee" }, async ({ bridge, send, message, clients, publications, errors, debug }) => {
        const topic = "v2/test/zigbee/pairing/power";
        const requests = () => publications.filter((entry) => entry.topic === "custom/zigbee/bridge/request/permit_join");
        const values = () => publications.filter((entry) => entry.topic === topic).map((entry) => entry.payload);

        assert(publications.some((entry) => entry.topic === "v2/test/zigbee/pairing/$type" && entry.payload === "switch"));
        message("custom/zigbee/bridge/info", { permit_join: false, config: { password: "hidden" } });
        assert(!JSON.stringify(debug).includes("hidden"));
        assert.deepEqual(values(), ["false"]);
        setPairing(clients[1], "true");
        await Promise.resolve();
        assert.equal(requests().at(-1)?.payload, '{"time":254}');
        assert.deepEqual(values(), ["false"], "Requests must not optimistically change the switch");
        message("custom/zigbee/bridge/info", { permit_join: true });
        assert.deepEqual(values(), ["false", "true"]);
        send([device("one")]);
        await waitFor(() => clients.length === 3);
        assert.equal(clients[1].connected, true, "Device rebuilds must not disconnect the pairing device");
        message("custom/zigbee/bridge/info", { permit_join: false });
        assert.equal(values().at(-1), "false", "Expiry or external changes must update the switch");
        setPairing(clients[1], "false");
        await Promise.resolve();
        assert.equal(requests().at(-1)?.payload, '{"time":0}');
        assert.deepEqual(errors, []);
        await bridge.cleanUp();
        assert(clients.every((client) => !client.connected));
    });
});

Deno.test("pairing rejects invalid or unavailable requests and reports failures", async () => {
    await withBridge({ publishError: new Error("Publish failed") }, async ({ bridge, message, clients, errors, publications, debug }) => {
        const pairingClient = clients[1];
        const requestTopic = "zigbee2mqtt/bridge/request/permit_join";
        message("zigbee2mqtt/bridge/info", { permit_join: false });
        setPairing(pairingClient, "invalid");
        message("zigbee2mqtt/bridge/state", { state: "offline" });
        setPairing(pairingClient, "true");
        assert.equal(publications.filter((entry) => entry.topic === requestTopic).length, 0);
        assert.deepEqual(bridge.healthCheck(), [{ deviceId: "zigbee", connected: false }]);

        message("zigbee2mqtt/bridge/state", { state: "online" });
        setPairing(pairingClient, "true");
        message("zigbee2mqtt/bridge/response/permit_join", { status: "error", error: "Rejected" });
        message("zigbee2mqtt/bridge/info", { permit_join: "true", config: { password: "hidden" } });
        clients[0].emit("message", "zigbee2mqtt/bridge/info", Buffer.from('{"password":"hidden"'), {
            cmd: "publish", topic: "zigbee2mqtt/bridge/info", payload: Buffer.alloc(0), qos: 0, dup: false, retain: false,
        });
        await Promise.resolve();
        assert.equal(publications.filter((entry) => entry.topic === "v2/test/zigbee/pairing/power").at(-1)?.payload, "false");
        assert.deepEqual(errors.map((entry) => entry[0]), [
            "Invalid Zigbee pairing switch value",
            "Cannot change Zigbee pairing: Zigbee2MQTT is disconnected",
            "Failed to publish Zigbee pairing request",
            "Zigbee2MQTT rejected pairing request",
            "Zigbee2MQTT bridge info is missing permit_join",
            "Invalid Zigbee2MQTT message on zigbee2mqtt/bridge/info",
        ]);
        assert(!JSON.stringify([...debug, ...errors]).includes("hidden"));
        clients[0].connected = false;
        clients[0].emit("close");
        assert.deepEqual(bridge.healthCheck(), [{ deviceId: "zigbee", connected: false }]);
        pairingClient.emit("reconnect");
        assert.equal(publications.filter((entry) => entry.topic === "v2/test/zigbee/$state").at(-1)?.payload, "disconnected");
        setPairing(pairingClient, "true");
        assert.equal(publications.filter((entry) => entry.topic === requestTopic).length, 1);
        clients[0].connected = true;
        message("zigbee2mqtt/bridge/state", { state: "online" });
        message("zigbee2mqtt/bridge/info", { permit_join: true });
        assert.deepEqual(bridge.healthCheck(), [{ deviceId: "zigbee", connected: true }]);
        assert.equal(publications.filter((entry) => entry.topic === "v2/test/zigbee/pairing/power").at(-1)?.payload, "true");
    });
});

Deno.test("pairing switch caches state before the control device is paired", async () => {
    await withBridge({ guest: true }, async ({ message, clients, publications }) => {
        message("zigbee2mqtt/bridge/info", { permit_join: true });
        assert.equal(publications.filter((entry) => entry.topic === "prefix/zigbee/pairing/power").at(-1)?.payload, "true");
        const topic = "prefix/zigbee/$config/apiKey/set";
        clients[1].emit("message", topic, Buffer.from("test"), {
            cmd: "publish", topic, payload: Buffer.from("test"), qos: 0, dup: false, retain: false,
        });
        assert.equal(clients.length, 3);
        assert.equal(publications.filter((entry) => entry.topic === "v2/test/zigbee/pairing/power").at(-1)?.payload, "true");
    });
});
