import '../config';
import { DeviceStatus, Platform } from '../lib/connection';
import { ComponentType, PropertyClass, PropertyDataType } from '../lib/type';
import fetch from 'node-fetch';
import assert from 'assert';
import mqtt from 'mqtt';

var MIN_30 = 30 * 60 * 1000; /* ms */
var SEC_10 = 10 * 1000; /* ms */
const API_TOKEN = process.env.API_TOKEN;
const REGISTRATION_NUMBER = process.env.REGISTRATION_NUMBER;
const MQTT_PASSWORD = process.env.SOLAX_MQTT_PASSWORD;

assert(API_TOKEN, 'missing env API_TOKEN');
assert(REGISTRATION_NUMBER, 'missing env REGISTRATION_NUMBER');
assert(MQTT_PASSWORD, 'missing env SOLAX_MQTT_PASSWORD');

const client = mqtt.connect('mqtt://mqtt002.solaxcloud.com', {
    username: REGISTRATION_NUMBER,
    password: MQTT_PASSWORD,
    port: 2901,
});

client.on('connect', function () {
    console.log('connected');
    client.subscribe('loc/tsp/SYSGQEJMDS', function (err) {
        if (err) {
            console.error(err);
        }
    });
});

client.on('message', function (topic, message) {
    // wait for Solax to sync their API
    console.log(`got message, sync in ${SEC_10} seconds`);
    setTimeout(() => syncPlatform(), SEC_10);
});

interface SolaxResponse {
    success: boolean;
    exception: string;
    result: {
        inverterSN: string;
        sn: string;
        acpower: number; // výkon střídače co přes něj teče sem i tam [W]
        yieldtoday: number; //  dnešní výroba [kW]
        yieldtotal: number; //  celková výroba [kW]
        feedinpower: number; //  co leze z baráku [W]
        feedinenergy: number; //  co leze z baráku [kWh]
        consumeenergy: number; //  Spotřeba střídače [kWh]
        feedinpowerM2: number; //  Výroba ? střídače [W]
        soc: number;
        peps1: number;
        peps2: number;
        peps3: number;
        inverterType: string;
        inverterStatus: string;
        uploadTime: string;
        batPower: number; //  Výkon baterie [W]
        powerdc1: number;
        powerdc2: number;
        powerdc3: null;
        powerdc4: null;
        batStatus: string;
    };
}

async function getData() {
    return fetch(
        `https://www.solaxcloud.com/proxyApp/proxy/api/getRealtimeInfo.do?tokenId=${API_TOKEN}&sn=${REGISTRATION_NUMBER}`
    )
        .then((res) => {
            if (!res.ok) {
                throw Error('Invalid response ' + res.status);
            }

            return res.json();
        })
        .then((body: SolaxResponse) => {
            if (!body.success) {
                throw Error(`Invalid response body: ${JSON.stringify(body)}`);
            }

            return body.result;
        });
}

const plat = new Platform('BOT-SOLAX11', 'martas', 'Foto');

let lastUploadTime: string | undefined;
async function syncPlatform() {
    try {
        const data = await getData();
        if (data.uploadTime === lastUploadTime) {
            return;
        } else {
            lastUploadTime = data.uploadTime;
        }

        plat.publishSensorData('feedinpower', data.feedinpower.toFixed(0));
        plat.publishSensorData('feedinpowerM2', data.feedinpowerM2.toFixed(0));
        plat.publishSensorData('acpower', data.acpower.toFixed(0));
        plat.publishSensorData('soc', data.soc.toFixed(0));
        plat.publishSensorData('yieldtoday', data.yieldtoday.toFixed(0));
        plat.publishSensorData('yieldtotal', data.yieldtotal.toFixed(0));
        plat.publishSensorData('batPower', data.batPower.toFixed(0));
        plat.publishSensorData('batStatus', data.batStatus);
        plat.publishSensorData('consumeenergy', data.consumeenergy.toFixed(0));
    } catch (err) {
        console.error(err);
    }
}

async function main() {
    const nodeLight = plat.addNode('invertor', 'Střídač', ComponentType.sensor);

    nodeLight.addProperty({
        propertyId: 'feedinpower',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'W',
        propertyClass: PropertyClass.Voltage,
        name: 'Výstup do sítě',
    });

    nodeLight.addProperty({
        propertyId: 'feedinpowerM2',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'W',
        propertyClass: PropertyClass.Voltage,
        name: 'Výroba',
    });

    nodeLight.addProperty({
        propertyId: 'acpower',
        propertyClass: PropertyClass.Voltage,
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'W',
        name: 'Výkon',
    });

    nodeLight.addProperty({
        propertyId: 'soc',
        propertyClass: PropertyClass.Pressure,
        dataType: PropertyDataType.float,
        unitOfMeasurement: '%',
        name: 'Baterie',
    });

    nodeLight.addProperty({
        propertyId: 'yieldtoday',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'kW',
        propertyClass: PropertyClass.Voltage,
        name: 'Dnešní výroba',
    });

    nodeLight.addProperty({
        propertyId: 'yieldtotal',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'kW',
        propertyClass: PropertyClass.Voltage,
        name: 'Celková výroba',
    });

    nodeLight.addProperty({
        propertyId: 'batPower',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'W',
        propertyClass: PropertyClass.Voltage,
        name: 'Výkon baterie',
    });

    nodeLight.addProperty({
        propertyId: 'batStatus',
        dataType: PropertyDataType.float,
        name: 'Baterie status',
    });

    nodeLight.addProperty({
        propertyId: 'consumeenergy',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'W',
        propertyClass: PropertyClass.Voltage,
        name: 'Spotřeba střídače',
    });

    await plat.init();

    syncPlatform();
    setInterval(() => {
        if (!lastUploadTime || Date.now() - new Date(lastUploadTime).getTime() > MIN_30) {
            console.log('No update for 30 mins -> forcing sync');
            syncPlatform();
        }
    }, 30 * 60 * 1000);
}

main();
