import SchemaValidator, { Type, string } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { Platform, ComponentType, PropertyDataType, PropertyClass } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import fetch from 'npm:node-fetch@3.3.2';
import mqtt from 'npm:mqtt@5';
import { FactoryFn } from '../types.ts';

const MIN_30 = 30 * 60 * 1000; /* ms */
const SEC_10 = 10 * 1000; /* ms */
// const API_TOKEN = Deno.env.get("API_TOKEN");
// const REGISTRATION_NUMBER = Deno.env.get("REGISTRATION_NUMBER");
// const MQTT_PASSWORD = Deno.env.get("SOLAX_MQTT_PASSWORD");

// assert(API_TOKEN, 'missing env API_TOKEN');
// assert(REGISTRATION_NUMBER, 'missing env REGISTRATION_NUMBER');
// assert(MQTT_PASSWORD, 'missing env SOLAX_MQTT_PASSWORD');

export const Schema = SchemaValidator({
    solaxApiKey: string,
    solaxRegistrationNumber: string,
    solaxMqttPassword: string,
})
type IntexConfig = Type<typeof Schema>;


export const factory: FactoryFn<IntexConfig> = function (config, device, logger) {
    const client = mqtt.connect('mqtt://mqtt002.solaxcloud.com', {
        username: device.solaxRegistrationNumber,
        password: device.solaxMqttPassword,
        port: 2901,
    });

    client.on('connect', function () {
        logger.debug('connected');
        client.subscribe('loc/tsp/SYSGQEJMDS', function (err) {
            if (err) {
                console.error(err);
            }
        });
    });

    client.on('message', function (topic, message) {
        // wait for Solax to sync their API
        logger.debug(`got message, sync in ${SEC_10} seconds`);
        setTimeout(() => syncPlatform(), SEC_10);
    });

    interface SolaxResponse {
        success: boolean;
        exception: string;
        result: {
            inverterSN: string;
            sn: string;
            acpower: number; // výkon střídače co přes něj teče sem i tam [W]
            yieldtoday: number; //  dnešní výroba [kWh]
            yieldtotal: number; //  celková výroba [kWh]
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
            powerdc1: number | null;
            powerdc2: number | null;
            powerdc3: number | null;
            powerdc4: number | null;
            batStatus: string;
        };
    }

    function getData() {
        return fetch(
            `https://www.solaxcloud.com:9443/proxy/api/getRealtimeInfo.do?tokenId=${device.solaxApiKey}&sn=${device.solaxRegistrationNumber}`
        )
            .then((res) => {
                if (!res.ok) {
                    throw Error('Invalid response ' + res.status);
                }

                return res.json();
            })
            .then(data => {
                const body = data as SolaxResponse;
                if (!body.success) {
                    throw Error(`Invalid response body: ${JSON.stringify(body)}`);
                }

                return body.result;
            });
    }

    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port);

    const nodeLight = plat.addNode('invertor', 'Střídač', ComponentType.sensor);
    const nodeBattery = plat.addNode('battery', 'Baterie', ComponentType.sensor);

    const feedInPowerProperty = nodeLight.addProperty({
        propertyId: 'feedinpower',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'W',
        propertyClass: PropertyClass.Voltage,
        name: 'Výstup do sítě',
    });

    const powerDcProperty = nodeLight.addProperty({
        propertyId: 'powerdc',
        propertyClass: PropertyClass.Voltage,
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'W',
        name: 'Okamžitý Výkon FE pole',
    });

    const acPowerProeprty = nodeLight.addProperty({
        propertyId: 'acpower',
        propertyClass: PropertyClass.Voltage,
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'W',
        name: 'Okamžitý Výkon střídače',
    });

    const yieldTodayProperty = nodeLight.addProperty({
        propertyId: 'yieldtoday',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'kWh',
        propertyClass: PropertyClass.Voltage,
        name: 'Dnešní výroba',
    });

    const batPowerProperty = nodeLight.addProperty({
        propertyId: 'batPower',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'W',
        propertyClass: PropertyClass.Voltage,
        name: 'Tok z/do baterie',
    });

    const consumeEnergyProperty = nodeLight.addProperty({
        propertyId: 'consumeenergy',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'kWh',
        propertyClass: PropertyClass.Voltage,
        name: 'Celkový odběr ze sítě',
    });

    const feedInEnergyProperty = nodeLight.addProperty({
        propertyId: 'feedinenergy',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'kWh',
        propertyClass: PropertyClass.Voltage,
        name: 'Celkem dodáno do sítě',
    });

    const yieldTotalProperty = nodeLight.addProperty({
        propertyId: 'yieldtotal',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'kWh',
        propertyClass: PropertyClass.Voltage,
        name: 'Celková výroba',
    });

    // baterry
    const socProperty = nodeBattery.addProperty({
        propertyId: 'soc',
        propertyClass: PropertyClass.Pressure,
        dataType: PropertyDataType.float,
        unitOfMeasurement: '%',
        name: 'Baterie',
    });

    const batStatusProperty = nodeBattery.addProperty({
        propertyId: 'batStatus',
        dataType: PropertyDataType.float,
        name: 'Baterie status',
    });

    const powerDc1Property = nodeBattery.addProperty({
        propertyId: 'powerdc1',
        dataType: PropertyDataType.float,
        name: 'Okamžitý výkon FE pole 1',
    });

    const powerDc2Property = nodeBattery.addProperty({
        propertyId: 'powerdc2',
        dataType: PropertyDataType.float,
        name: 'Okamžitý výkon FE pole 2',
    });

    let lastUploadTime: string | undefined;
    async function syncPlatform() {
        try {
            const data = await getData();
            if (data.uploadTime === lastUploadTime) {
                return;
            } else {
                lastUploadTime = data.uploadTime;
            }

            feedInPowerProperty.setValue(data.feedinpower.toFixed(0))
            acPowerProeprty.setValue(data.acpower.toFixed(0))
            socProperty.setValue(data.soc.toFixed(0))
            yieldTodayProperty.setValue(data.yieldtoday.toFixed(1))
            yieldTotalProperty.setValue(data.yieldtotal.toFixed(0))
            batPowerProperty.setValue(data.batPower.toFixed(0))
            batStatusProperty.setValue(data.batStatus);
            feedInEnergyProperty.setValue(data.feedinenergy.toFixed(0))
            consumeEnergyProperty.setValue(data.consumeenergy.toFixed(0))
            powerDc1Property.setValue((data.powerdc1 || 0).toFixed(0));
            powerDc2Property.setValue((data.powerdc2 || 0).toFixed(0))

            powerDcProperty.setValue(
                ((data.powerdc1 || 0) + (data.powerdc2 || 0) + (data.powerdc3 || 0) + (data.powerdc4 || 0)).toFixed(0)
            );
        } catch (err) {
            console.error(err);
        }
    }

    plat.init();

    syncPlatform();
    const syncInterval = setInterval(() => {
        if (!lastUploadTime || Date.now() - new Date(lastUploadTime).getTime() > MIN_30) {
            console.log('No update for 30 mins -> forcing sync');
            syncPlatform();
        }
    }, 30 * 60 * 1000);

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