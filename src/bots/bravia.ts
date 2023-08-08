import '../config';
import { DeviceStatus, Platform } from '../lib/connection';
import { ComponentType, PropertyDataType } from '../lib/type';
import { exec } from "node:child_process";

const Bravia = require('bravia');

const { BRAVIA_IP } = process.env

console.log('BRAVIA_IP', process.env.BRAVIA_IP);
const bravia = new Bravia(BRAVIA_IP, '80', '5211');

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

// number
async function getVolume(): Promise<number | never> {
    const info = await bravia.audio.invoke('getVolumeInformation');
    return info.find((obj: any) => obj.target === 'speaker')?.volume;
}
// active|
async function getPowerStatus(): Promise<'active' | 'standby'> {
    const info = await bravia.system.invoke('getPowerStatus');
    return info.status;
}

async function setVolume(volume: string) {
    return bravia.audio.invoke('setAudioVolume', '1.0', {
        target: 'speaker',
        volume: volume,
    });
}

async function setPowerStatus(bool: boolean) {
    return bravia.system.invoke('setPowerStatus', '1.0', { status: bool });
}

const plat = new Platform('BOT-TV198111', 'martas', 'Televize');

async function main() {
    const nodeLight = plat.addNode('television', 'Televize', ComponentType.switch);
    nodeLight.addProperty({
        propertyId: 'power',
        dataType: PropertyDataType.boolean,
        name: 'TV',
        settable: true,
        callback: (prop) => {
            if (prop.value === 'true') setPowerStatus(true);
            else setPowerStatus(false);
        },
    });

    nodeLight.addProperty({
        propertyId: 'volume',
        dataType: PropertyDataType.integer,
        format: '0:80',
        name: 'TV',
        settable: true,
        callback: (prop) => {
            setVolume(prop.value);
        },
    });

    nodeLight.addProperty({
        propertyId: 'view',
        dataType: PropertyDataType.enum,
        format: "kamera_1,kamera_2,nic",
        name: 'Zobrazit',
        settable: true,
        callback: (prop) => {
            if (prop.value === "kamera_1")
                exec(`catt --device ${BRAVIA_IP} cast_site "http://192.168.10.88:8888/camera_1/mjpeg-stream"`, (err) => {
                    console.error(err)
                })
            else if (prop.value === "kamera_2")
                exec(`catt --device ${BRAVIA_IP} cast_site "http://192.168.10.88:8888/camera_2/mjpeg-stream"`, (err) => {
                    console.error(err)
                })
            else if (prop.value === "nic")
                exec(`catt --device ${BRAVIA_IP} stop`, (err) => {
                    console.error(err)
                })
        },
    });

    //   nodeLight.addProperty({
    //     propertyId: 'channel',
    //     dataType: PropertyDataType.integer,
    //     name: 'TV',
    //     settable: true,
    //     callback: (prop) => {
    //       setVolume(prop.value);
    //     },
    //   });

    await plat.init();

    async function syncPlatform() {
        try {
            const power = await getPowerStatus();
            plat.publishData('television', 'power', power == 'active' ? 'true' : 'false');

            const volume = await getVolume();
            plat.publishData('television', 'volume', String(volume));

            plat.setStatus(DeviceStatus.ready);
        } catch (err) {
            const e = <any>err;
            if (e.code === 'EHOSTUNREACH' || e.code === 'ETIMEDOUT') {
                plat.setStatus(DeviceStatus.alert);
            } else console.error(e);
        }
    }

    syncPlatform();
    setInterval(syncPlatform, 3 * 60 * 1000);
}

main();

// async function main() {
//   console.log(await getVolume());
//   console.log(await getPowerStatus());
//   console.log(setPowerStatus(true));
//   console.log(await bravia.system.invoke('getPowerSavingMode'));
// }
// setPowerStatus(false);
// main();
