import { DeviceTransformed, TransformedExpose, type TransformedExposes } from "./convertor.ts";
import { Platform, ComponentType, Logger, Node } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { translate } from "./translate.ts";
import { ILocalStorage } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/storage.ts";
import { PropertyDataType } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/type.ts";

interface SpawnConfig {
    userName: string,
    mqtt: { uri: string, port: number },
    deeplApiKey?: string
}
export async function spawnDevices(
    devices: DeviceTransformed[],
    publishSetToZigbee: (friendly_name: string, property: string) => (value: string) => void,
    config: SpawnConfig,
    logger: Logger,
    storage: ILocalStorage
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
            storage,
        );
        platforms.push(plat);

        const hasSwitch = device.definition?.exposes.some((node: TransformedExposes) => {
            if ('features' in node) {
                if (node.type === "switch") return true;
            }

            return false;
        })

        const hasSensor = device.definition?.exposes.some((node: TransformedExposes) => {
            if (!('features' in node)) {
                return node.dataType === PropertyDataType.float && !["battery", "linkquality"].includes(node.propertyId)
            }

            return false;
        })

        const thing = plat.addNode(
            "node",
            device.friendly_name || "Node",
            hasSwitch ? ComponentType.switch : hasSensor ? ComponentType.sensor : ComponentType.generic,
        );

        for (const node of device.definition?.exposes || []) {
            if ('features' in node) {
                for (const property of node.features) {
                    await assignProperty(
                        property,
                        thing,
                        publishSetToZigbee(friendly_name, property.propertyId),
                        config.deeplApiKey,
                        logger
                    );
                }
            } else {
                await assignProperty(
                    node,
                    thing,
                    publishSetToZigbee(friendly_name, node.propertyId),
                    config.deeplApiKey,
                    logger
                );
            }
        }

        plat.init();
    }

    return platforms
}


export async function assignProperty(
    expose: TransformedExpose,
    thing: Node,
    publishBridge: (value: string) => void,
    deeplApiKey: string | undefined,
    log: Logger
) {
    const translatedName = await translate(expose.name, log, deeplApiKey);

    thing.addProperty({
        ...expose,
        name: translatedName,
        callback: (newValue) => {
            log.debug(`recieved ${expose.dataType}: ${newValue}`);
            publishBridge(expose.translateForZigbee ? expose.translateForZigbee(newValue) : newValue);

            return Promise.resolve(false);
        },
    })
}
