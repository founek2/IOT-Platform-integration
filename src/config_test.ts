import assert from "node:assert/strict";
import { PropertyDataType } from "iot-platform/deno";
import { SchemaGeneral } from "./types.ts";
import { Schema as ZigbeeSchema } from "./bridges/zigbee2mqtt.ts";
import { Schema as FrigateSchema } from "./bridges/frigate.ts";
import { Schema as MatterSchema } from "./bridges/matter.ts";
import { Schema as UnifiSchema } from "./custom/unifi.ts";
import { Schema as BraviaSchema } from "./devices/bravia.ts";
import { Schema as TizenSchema } from "./devices/tizen.ts";

Deno.test("general configuration preserves sections and defaults the MQTT port", () => {
    const bridge = { name: "Zigbee", type: "zigbee2mqtt", zigbeeMqtt: { uri: "mqtt://local", port: 1883 } };
    const result = SchemaGeneral.parse({
        userName: "test",
        mqtt: { uri: "mqtt://local", port: null },
        bridges: { bridge },
        devices: null,
    });
    assert.equal(result.mqtt.port, 1883);
    assert.deepEqual(result.bridges, { bridge });
    assert.equal(result.devices, undefined);
    assert.equal(SchemaGeneral.safeParse({ userName: "test", mqtt: { uri: "mqtt://local", port: "1883" } }).success, false);
    assert.equal(SchemaGeneral.safeParse({ userName: "test", mqtt: { uri: "mqtt://local" }, bridges: "invalid" }).success, false);
});

Deno.test("bridge schemas validate nested mappings and optional values", () => {
    const zigbee = ZigbeeSchema.parse({
        zigbeeMqtt: { uri: "mqtt://local", port: 1883, prefix: null },
        whitelist: ["device"],
        override: { device: { properties: { temperature: { type: PropertyDataType.float, format: null } } } },
    });
    assert.equal(zigbee.zigbeeMqtt.prefix, "zigbee2mqtt");
    assert.equal(zigbee.override?.device.properties?.temperature.type, PropertyDataType.float);
    assert.equal(ZigbeeSchema.safeParse({
        zigbeeMqtt: { uri: "mqtt://local", port: 1883 },
        override: { device: { properties: { temperature: { type: "invalid" } } } },
    }).success, false);

    const frigate = FrigateSchema.parse({
        frigateUrl: "http://local",
        frigateMqtt: { uri: "mqtt://local", port: 1883 },
        sensors: { camera: { properties: { motion: { name: "Motion", type: PropertyDataType.boolean, settable: false } } } },
    });
    assert.equal(frigate.frigateMqtt.prefix, "frigate");
    assert.equal(frigate.sensors?.camera.properties?.motion.settable, false);
    assert.equal(MatterSchema.parse({ matterUrl: null }).matterUrl, "ws://192.168.25.5:5580/ws");
});

Deno.test("device schemas validate actions and legacy null optionals", () => {
    assert.equal(BraviaSchema.safeParse({ braviaIp: "local", braviaPsk: 1234, braviaActions: null }).success, true);
    assert.equal(BraviaSchema.safeParse({ braviaIp: "local", braviaPsk: 1234, braviaActions: [{ name: "Missing URL" }] }).success, false);
    const tizen = TizenSchema.parse({ tizenIp: "local", tizenMac: "mac", tizenToken: null });
    assert.equal(tizen.tizenUpnpPort, 8081);
    assert.equal(tizen.tizenToken, undefined);

    const unifi = UnifiSchema.parse({
        unifiControllerUrl: "http://local", unifiUserName: "test", unifiPassword: "test",
        unifiWatcher: [{ hosts: ["local"], webhooksUp: [{ url: "http://local", headers: null }], webhooksDown: [] }],
    });
    assert.deepEqual(unifi.unifiWatcher[0].webhooksUp[0].headers, {});
    assert.equal(unifi.unifiWatcher[0].lastSeen, "2d");
    assert.equal(UnifiSchema.safeParse({
        unifiControllerUrl: "http://local", unifiUserName: "test", unifiPassword: "test",
        unifiWatcher: [{ hosts: [42], webhooksUp: [], webhooksDown: [] }],
    }).success, false);
});
