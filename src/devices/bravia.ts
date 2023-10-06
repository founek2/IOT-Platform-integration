import { exec } from "https://deno.land/x/exec@0.0.5/mod.ts";
import { Platform, DeviceStatus, ComponentType, PropertyDataType } from "https://raw.githubusercontent.com/founek2/IOT-Platforma-zigbee/master/src/lib/mod.ts"
import Bravia from "npm:bravia@^1.3.3";
import { FactoryFn } from '../types.ts';
import SchemaValidator, { Type, string, number, array } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';

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

export const factory: FactoryFn<BraviaConfig> = function (config, device, logger) {
    const bravia = new Bravia(device.braviaIp, '80', device.braviaPsk);

    async function getVolume(): Promise<number | never> {
        const info = await bravia.audio.invoke('getVolumeInformation');
        return info.find((obj: any) => obj.target === 'speaker')?.volume;
    }

    async function getPowerStatus(): Promise<'active' | 'standby'> {
        const info = await bravia.system.invoke('getPowerStatus');
        return info.status;
    }

    function setVolume(volume: string) {
        return bravia.audio.invoke('setAudioVolume', '1.0', {
            target: 'speaker',
            volume: volume,
        });
    }

    function setPowerStatus(bool: boolean) {
        return bravia.system.invoke('setPowerStatus', '1.0', { status: bool });
    }

    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port);

    const nodeLight = plat.addNode('television', 'Televize', ComponentType.switch);
    const powerProperty = nodeLight.addProperty({
        propertyId: 'power',
        dataType: PropertyDataType.boolean,
        name: 'TV',
        settable: true,
        callback: async (newValue) => {
            if (newValue === 'true') await setPowerStatus(true);
            else await setPowerStatus(false);
            return true;
        },
    });

    const volumeProperty = nodeLight.addProperty({
        propertyId: 'volume',
        dataType: PropertyDataType.integer,
        format: '0:80',
        name: 'TV',
        settable: true,
        callback: async (newValue) => {
            await setVolume(newValue);
            return true
        },
    });

    if (device.braviaActions) {
        nodeLight.addProperty({
            propertyId: 'view',
            dataType: PropertyDataType.enum,
            format: [...device.braviaActions.map(v => v.name), "stop"].join(","),
            name: 'Zobrazit',
            settable: true,
            callback: async (newValue) => {
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
            },
        });
    }

    plat.init();

    async function syncPlatform() {
        try {
            const power = await getPowerStatus();
            powerProperty.setValue(power == 'active' ? 'true' : 'false');

            if (power === "active") {
                const volume = await getVolume();
                volumeProperty.setValue(String(volume));
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