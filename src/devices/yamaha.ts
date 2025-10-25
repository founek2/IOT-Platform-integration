import { Platform, DeviceStatus, ComponentType, PropertyDataType } from "iot-platform/deno"
import { FactoryFn } from '../types.ts';
import SchemaValidator, { Type, string, number } from 'computed_types';
import { YamahaClient, YamahaInput } from "./yamaha/YamahaClient.ts"

export const Schema = SchemaValidator({
    yamahaIp: string,
    yamahaEventPort: number.optional()
})

type YamahaConfig = Type<typeof Schema>;

export const factory: FactoryFn<YamahaConfig> = async function (config, device, logger, storage) {
    if (device.yamahaEventPort)
        logger.info("Enabling events subscription")

    const yamaha = new YamahaClient(device.yamahaIp, device.yamahaEventPort);

    try {
        await yamaha.sync()
    } catch (_) {
        logger.warning("failed to get initial config")
    }

    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port, storage);

    const reciever = plat.addNode('reciever', 'Reciever', ComponentType.switch);
    const recieverPower = reciever.addProperty({
        propertyId: 'power',
        dataType: PropertyDataType.boolean,
        name: 'Zapnutí',
        settable: true,
        callback: (newValue) => {
            return newValue === 'true' ? yamaha.powerOn() : yamaha.powerOff();
        },
    });

    const recieverVolume = reciever.addProperty({
        propertyId: 'volume',
        dataType: PropertyDataType.integer,
        format: `0:${yamaha.getMaxVolume() || 100}`,
        name: 'Hlasitost',
        settable: true,
        callback: (newValue) => {
            return yamaha.setVolume(parseInt(newValue))
        },
    });

    const recieverInput = reciever.addProperty({
        propertyId: 'input',
        dataType: PropertyDataType.enum,
        format: Object.values(YamahaInput).join(","),
        name: 'Vstup',
        settable: true,
        callback: (newValue) => {
            if (newValue in YamahaInput) {
                return yamaha.setInput(newValue as YamahaInput)
            }
            return false
        },
    });

    plat.init();

    yamaha.on("power", (power) => {
        logger.debug("Recieved power event", power)
        recieverPower.setValue(power == "on" ? "true" : "false")
    })
    yamaha.on("input", (input) => recieverInput.setValue(input))
    yamaha.on("volume", (volume) => recieverVolume.setValue(volume.toString()))

    async function syncPlatform() {
        try {
            await yamaha.sync()

            const power = yamaha.getPower();
            if (power) recieverPower.setValue(power == "on" ? "true" : "false")

            const input = yamaha.getInput();
            if (input) recieverInput.setValue(input)

            const volume = yamaha.getVolume();
            if (volume) recieverVolume.setValue(volume.toString())
        } catch (e: any) {
            if (e.code === 'EHOSTUNREACH' || e.code === 'ETIMEDOUT') {
                plat.publishStatus(DeviceStatus.alert);
            } else logger.error(e);
        }
    }

    syncPlatform();
    const syncInterval = setInterval(syncPlatform, 5 * 60 * 1000);

    return {
        cleanUp: function () {
            clearInterval(syncInterval)
            plat.disconnect()
        },
        healthCheck: function () {
            return {
                deviceId: plat.deviceId,
                connected: plat.client.connected
            }
        }
    };
}