import SchemaValidator, { Type, string, number } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { Platform, DeviceStatus, PropertyDataType, ComponentType, Property } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { FactoryFn } from '../types.ts';
import mqtt from "npm:mqtt@5";
import { topicParser } from './zigbee2mqtt/topicParser.ts';

function retry<T>(fn: () => T, every: number = 5_000, onError: (err: unknown) => any) {
    return new Promise<T>((res) => {
        const interval = setInterval(async () => {
            try {
                const data = await fn()
                clearInterval(interval)
                res(data)
            } catch (err) {
                onError(err)
            }
        }, every)
    })

}

export const Schema = SchemaValidator({
    frigateUrl: string,
    frigateMqtt: {
        uri: string,
        port: number,
        prefix: string.optional("frigate")
    },
    frigateStreamUrl: string.optional()
})

type FrigateConfig = Type<typeof Schema>;

export const factory: FactoryFn<FrigateConfig> = async function (config, bridge, logger, storage) {
    const cams: Record<string, Property> = {};

    const HOST = bridge.frigateUrl;

    async function fetchConfig(): Promise<FrigateRemoteConfig> {
        const frigateConfigRes = await fetch(`${HOST}/api/config`);
        if (!frigateConfigRes.ok) {
            throw new Error(`Failed to communicate with Frigate on url: ${HOST}`)
        }
        return frigateConfigRes.json()
    }
    const frigateConfig = await retry(fetchConfig, 5000, () => logger.error("Failed to fetch config"))

    const cameras = frigateConfig.cameras;

    const plat = new Platform(bridge.id, config.userName, bridge.name, config.mqtt.uri, config.mqtt.port, storage);
    for (const [name, _camera] of Object.entries(cameras)) {
        const node = plat.addNode(name, name, ComponentType.generic);

        const streamName = Object.keys(frigateConfig.go2rtc?.streams || {}).find(streamName => streamName.includes(name))
        if (bridge.frigateStreamUrl && streamName) {
            const stream = node.addProperty({
                propertyId: 'stream',
                dataType: PropertyDataType.string,
                name: "Náhled",
                format: bridge.frigateStreamUrl.includes("webrtc") ? "webrtc" : "video/mp4",
                retained: true,
            });
            stream.setValue(`${bridge.frigateStreamUrl}?src=${streamName}`)
        }

        const property = node.addProperty({
            propertyId: 'image',
            dataType: PropertyDataType.binary,
            name: "Událost",
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
        },
        healthCheck: function () {
            return {
                deviceId: plat.deviceId,
                connected: plat.client.connected
            }
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
    go2rtc?: {
        streams?: { [name: string]: string[] }
    }
}