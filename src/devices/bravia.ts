import { exec } from "https://deno.land/x/exec@0.0.5/mod.ts";
import { Platform, DeviceStatus, ComponentType, PropertyDataType } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { FactoryFn } from '../types.ts';
import SchemaValidator, { Type, string, number, array } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { BraviaClient } from "./bravia/BraviaClient.ts"
import { CallbackFn } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/property.ts";

const ActionSchema = SchemaValidator({
    name: string,
    url: string
})

export const Schema = SchemaValidator({
    braviaIp: string,
    braviaPsk: number,
    braviaActions: array.of(ActionSchema).optional()
})

type BraviaConfig = Type<typeof Schema>;

export const factory: FactoryFn<BraviaConfig> = function (config, device, logger, storage) {
    const bravia = new BraviaClient(device.braviaIp, device.braviaPsk);

    // bravia.audio.getMethodTypes()
    //     .then((info: any) => console.log(info))
    //     .catch((error: any) => console.error(error));



    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port, storage);

    function handleAction(cb: CallbackFn) {
        const fn: CallbackFn = async (newValue): Promise<boolean | void> => {
            try {
                return await cb(newValue)
            } catch (err: any) {
                if (err.message?.includes('status code: 403'))
                    logger.error('action failed, invalid pre-shared key.')
                else logger.error('action failed. Error:', err)
                plat.publishStatus(DeviceStatus.alert)
                return false;
            }
        }

        return fn;
    }

    const nodeLight = plat.addNode('television', 'Televize', ComponentType.switch);
    const powerProperty = nodeLight.addProperty({
        propertyId: 'power',
        dataType: PropertyDataType.boolean,
        name: 'TV',
        settable: true,
        callback: handleAction(async (newValue) => {
            if (newValue === 'true') await bravia.setPowerStatus(true);
            else await bravia.setPowerStatus(false);
            return true;
        }),
    });

    const volumeProperty = nodeLight.addProperty({
        propertyId: 'volume',
        dataType: PropertyDataType.integer,
        format: '0:80',
        name: 'TV',
        settable: true,
        callback: handleAction(async (newValue) => {
            await bravia.setVolume(newValue);
            return true
        })
    });

    const muteProperty = nodeLight.addProperty({
        propertyId: 'mute',
        dataType: PropertyDataType.boolean,
        name: 'Ztlumit',
        settable: true,
        callback: handleAction(async (newValue) => {
            if (newValue == "true")
                await bravia.muteSpeaker()
            else
                await bravia.unmuteSpeaker()
            return true
        }),
    });

    if (device.braviaActions) {
        nodeLight.addProperty({
            propertyId: 'view',
            dataType: PropertyDataType.enum,
            format: [...device.braviaActions.map(v => v.name), "stop"].join(","),
            name: 'Zobrazit',
            settable: true,
            callback: handleAction(async (newValue) => {
                const action = device.braviaActions?.find(v => v.name === newValue)
                if (action) {
                    await exec(`catt --device ${device.braviaIp} cast_site "${action.url}"`)
                    return true
                }

                if (newValue === "stop") {
                    await exec(`catt --device ${device.braviaIp} stop`)
                    return true
                }

                return false;
            }),
        });
    }

    plat.init();

    async function syncPlatform() {
        try {
            await bravia.sync();

            powerProperty.setValue(bravia.getPowerStatus() == 'active' ? 'true' : 'false');

            if (bravia.getPowerStatus() === "active") {
                const volume = bravia.getVolume()?.toString()
                if (volume) volumeProperty.setValue(volume);
                muteProperty.setValue(bravia.isMuted().toString())
            }
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


// async function main() {
//   console.log(await getVolume());
//   console.log(await getPowerStatus());
//   console.log(setPowerStatus(true));
//   console.log(await bravia.system.invoke('getPowerSavingMode'));
// }
// setPowerStatus(false);
// main();

// bravia.system
//   .getMethodTypes()
//   .then((methods) => console.log(...methods.map((m) => m.methods)))
//   .catch((error) => console.error(error));

// Retrieves all the available IRCC commands from the TV.
// bravia.system
//   .invoke('getRemoteControllerInfo')
//   .then((commands) => console.log(commands))
//   .catch((error) => console.error(error));

// Queries the volume info.