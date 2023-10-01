import SchemaValidator, { Type, string, number } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { Platform, DeviceStatus, PropertyDataType, ComponentType, Property } from "https://raw.githubusercontent.com/founek2/IOT-Platforma-zigbee/master/src/lib/mod.ts"
import { FactoryFn } from '../types.ts';
import mqtt from "npm:mqtt@5";
import { topicParser } from './zigbee2mqtt/topicParser.ts';

export const Schema = SchemaValidator({
    frigateUrl: string,
    frigateMqtt: {
        uri: string,
        port: number,
        prefix: string.optional("frigate")
    }
})

type FrigateConfig = Type<typeof Schema>;

export const factory: FactoryFn<FrigateConfig> = async function (config, bridge, logger) {
    const cams: Record<string, Property> = {};

    const HOST = bridge.frigateUrl;
    const frigateConfigRes = await fetch(`${HOST}/api/config`);
    if (!frigateConfigRes.ok) {
        throw new Error(`Failed to communicate with Frigate on url: ${HOST}`)
    }

    const frigateConfig = await frigateConfigRes.json() as FrigateRemoteConfig
    const cameras = frigateConfig.cameras;

    const plat = new Platform(bridge.id, config.userName, bridge.name, config.mqtt.uri, config.mqtt.port);
    for (const [name, camera] of Object.entries(cameras)) {
        const node = plat.addNode(name, name, ComponentType.generic);
        const property = node.addProperty({
            propertyId: 'image',
            dataType: PropertyDataType.binary,
            name: name,
            format: "image/jpeg"
        });
        cams[name] = property
    }

    plat.init()

    const client = mqtt.connect(bridge.frigateMqtt.uri, {
        port: bridge.frigateMqtt.port,
    });

    client.on("connect", function () {
        client.subscribe(`${bridge.frigateMqtt.prefix}/#`);
    });
    client.on("reconnect", () => logger.silly("reconnected"))

    client.on("error", function (err) {
        logger.error("error", err);
    });

    client.on("disconnect", function () {
        logger.debug("disconnected");
    });

    client.on("message", function (topic, message) {
        // logger.debug("message", topic);

        const handle = topicParser(topic, message);

        handle(`${bridge.frigateMqtt.prefix}/available`, async function (_topic, message) {
            const status = message.toString() as "online" | "offline";
            plat.publishStatus(status === "online" ? DeviceStatus.ready : DeviceStatus.disconnected)
        });
        Object.keys(cameras).forEach(cam_name => {
            handle(`${bridge.frigateMqtt.prefix}/${cam_name}/(${frigateConfig.objects?.track?.join("|")})/snapshot`, async function (topic, message) {
                cams[cam_name].setValue(message)
            });
        })
    })

    return {
        cleanUp: async function () {
            await plat.disconnect()
        }
    }
}

interface FrigateRemoteCamera {
    ffmpeg: {
        inputs: { path: string, roles: ("detect" | "record")[] }[]
    },
    motion?: {
        mask: string[]
    },
    zones?: Record<string, { coordinates: string }>
}
interface FrigateRemoteConfig {
    cameras: Record<string, FrigateRemoteCamera>
    objects?: {
        track?: string[]
    }
}