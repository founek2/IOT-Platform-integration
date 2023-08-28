import config from '../config.ts';
import { ComponentType, PropertyDataType } from '../lib/type.ts';
import { exec } from "https://deno.land/x/exec/mod.ts";
import { Platform, DeviceStatus } from "https://raw.githubusercontent.com/founek2/IOT-Platforma-zigbee/master/src/lib/connection.ts"
import Bravia from "npm:bravia@^1.3.3";
import { assert } from "https://deno.land/std@0.200.0/assert/mod.ts";

const BRAVIA_IP = Deno.env.get("BRAVIA_IP")
assert(BRAVIA_IP, "Missing required env BRAVIA_IP")
console.log('BRAVIA_IP', BRAVIA_IP);
const bravia = new Bravia(BRAVIA_IP, '80', '5211');

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

const plat = new Platform('BOT-TV198111', 'martas', 'Televize', config.MQTT_SERVER_URL, config.MQTT_SERVER_PORT);

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

const viewProperty = nodeLight.addProperty({
    propertyId: 'view',
    dataType: PropertyDataType.enum,
    format: "kamera_1,kamera_2,nic",
    name: 'Zobrazit',
    settable: true,
    callback: async (newValue) => {
        if (newValue === "kamera_1")
            await exec(`catt --device ${BRAVIA_IP} cast_site "http://192.168.10.88:8888/camera_1/mjpeg-stream"`)
        else if (newValue === "kamera_2")
            await exec(`catt --device ${BRAVIA_IP} cast_site "http://192.168.10.88:8888/camera_2/mjpeg-stream"`)
        else if (newValue === "nic")
            await exec(`catt --device ${BRAVIA_IP} stop`)

        return true
    },
});

plat.init();

async function syncPlatform() {
    try {
        const power = await getPowerStatus();
        powerProperty.setValue(power == 'active' ? 'true' : 'false');

        const volume = await getVolume();
        volumeProperty.setValue(String(volume));
    } catch (e: any) {
        if (e.code === 'EHOSTUNREACH' || e.code === 'ETIMEDOUT') {
            plat.publishStatus(DeviceStatus.alert);
        } else console.error(e);
    }
}

syncPlatform();
setInterval(syncPlatform, 3 * 60 * 1000);


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