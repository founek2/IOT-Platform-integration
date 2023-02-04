import '../config';
import { DeviceStatus, Platform } from '../lib/connection';
import { ComponentType, PropertyClass, PropertyDataType } from '../lib/type';
import fetch from 'node-fetch';
import assert from 'assert';

const API_TOKEN = process.env.API_TOKEN;
const REGISTRATION_NUMBER = process.env.REGISTRATION_NUMBER;

assert(API_TOKEN, 'missing env API_TOKEN');
assert(REGISTRATION_NUMBER, 'missing env REGISTRATION_NUMBER');

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

    async function syncPlatform() {
        try {
            const data = await getData();

            plat.publishSensorData('feedinpower', data.feedinpower.toFixed(0));
            plat.publishSensorData('feedinpowerM2', data.feedinpowerM2.toFixed(0));
            plat.publishSensorData('acpower', data.acpower.toFixed(0));
            plat.publishSensorData('yieldtoday', data.yieldtoday.toFixed(0));
            plat.publishSensorData('yieldtotal', data.yieldtotal.toFixed(0));
            plat.publishSensorData('batPower', data.batPower.toFixed(0));
            plat.publishSensorData('batStatus', data.batStatus);
            plat.publishSensorData('consumeenergy', data.consumeenergy.toFixed(0));
        } catch (err) {
            console.error(err);
        }
    }

    syncPlatform();
    setInterval(syncPlatform, 2 * 60 * 1000);
}

main();
