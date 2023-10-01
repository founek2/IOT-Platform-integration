import { Device, assignProperty } from "./convertor.ts";
import { Platform, ComponentType, Logger } from "https://raw.githubusercontent.com/founek2/IOT-Platforma-zigbee/master/src/lib/mod.ts"

interface SpawnConfig {
    userName: string,
    mqtt: { uri: string, port: number },
    deeplApiKey?: string
}
export async function spawnDevices(
    devices: Device[],
    publishSetToZigbee: (friendly_name: string, property: string) => (value: string) => void,
    config: SpawnConfig,
    logger: Logger
) {
    const platforms: Platform[] = []

    for (const device of devices) {
        // TODO delete api key when not paired
        // const paired = platformDevices.find(
        //   (d) => d.metadata.deviceId === device.ieee_address,
        // );
        const friendly_name = device.friendly_name || device.ieee_address;

        const plat = new Platform(
            device.ieee_address,
            config.userName,
            friendly_name,
            config.mqtt.uri,
            config.mqtt.port,
        );
        platforms.push(plat);

        const thing = plat.addNode(
            device.friendly_name || "Node",
            device.friendly_name || "Node",
            ComponentType.generic,
        );

        for (const node of device.definition?.exposes || []) {
            switch (node.type) {
                case "switch":
                    for (const property of node.features) {
                        await assignProperty(
                            property,
                            thing,
                            publishSetToZigbee(friendly_name, property.name),
                            config.deeplApiKey,
                            logger
                        );
                    }
                    break;
                default:
                    await assignProperty(
                        node,
                        thing,
                        publishSetToZigbee(friendly_name, node.name),
                        config.deeplApiKey,
                        logger
                    );
            }
        }

        plat.init();
    }

    return platforms
}