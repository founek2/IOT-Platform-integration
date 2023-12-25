import { Platform, DeviceStatus, ComponentType, PropertyDataType } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { FactoryFn } from '../types.ts';
import SchemaValidator, { Type, string } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { YamahaClient, YamahaInput } from "./yamaha/YamahaClient.ts"

export const Schema = SchemaValidator({
    yamahaIp: string,
})

type YamahaConfig = Type<typeof Schema>;

export const factory: FactoryFn<YamahaConfig> = function (config, device, logger) {
    const yamaha = new YamahaClient(device.yamahaIp);

    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port);

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
        format: '0:80',
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

    async function syncPlatform() {
        try {
            await yamaha.sync()

            const power = yamaha.getPower();
            if (power) recieverPower.setValue(power)

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
    const syncInterval = setInterval(syncPlatform, 3 * 60 * 1000);

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