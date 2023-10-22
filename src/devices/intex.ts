import SchemaValidator, { Type, string, number } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { Platform, ComponentType, PropertyDataType, PropertyClass, DeviceStatus } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { Socket } from 'node:net';
import { decodeData, prepareCommand, commands } from './intex/spaDecoder.ts';
import { FactoryFn } from '../types.ts';
import { Buffer } from 'https://deno.land/std@0.197.0/streams/buffer.ts';

export const Schema = SchemaValidator({
    intexIp: string,
    intexPort: number,
})

type IntexConfig = Type<typeof Schema>;


export const factory: FactoryFn<IntexConfig> = function (config, device, logger) {
    const client = new Socket();

    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port);


    const nodeLight = plat.addNode('control', 'Vířivka', ComponentType.switch);

    const switchProperty = nodeLight.addProperty({
        propertyId: 'switch',
        dataType: PropertyDataType.boolean,
        name: 'Ohřev',
        settable: true,
        callback: async function (prop) {
            const response = await sendData(commands.heater);
            sync(response.data);
        },
    });
    const bubblesProperty = nodeLight.addProperty({
        propertyId: 'bubbles',
        dataType: PropertyDataType.boolean,
        name: 'Bubliny',
        settable: true,
        callback: async function (prop) {
            const response = await sendData(commands.bubbles);
            sync(response.data);
        },
    });

    const nozzlesProperty = nodeLight.addProperty({
        propertyId: 'nozzles',
        dataType: PropertyDataType.boolean,
        name: 'Trysky',
        settable: true,
        callback: async function (prop) {
            const response = await sendData(commands.jets);
            sync(response.data);
        },
    });

    const pumpProperty = nodeLight.addProperty({
        propertyId: 'pump',
        dataType: PropertyDataType.boolean,
        name: 'Filtrace',
        settable: true,
        callback: async function (prop) {
            const response = await sendData(commands.filter);
            sync(response.data);
        },
    });

    const electrolysisProperty = nodeLight.addProperty({
        propertyId: 'sanitizer',
        dataType: PropertyDataType.boolean,
        name: 'Elektrolýza',
        settable: true,
        callback: function (value) {
            if (value === 'true') sendData(commands.sanitizer);
            else sendData(commands.sanitizer);
        },
    });

    const nodeSwitch = plat.addNode('sensor', 'Teplota', ComponentType.sensor);
    const tempCurrentProperty = nodeSwitch.addProperty({
        propertyId: 'tempCurrent',
        dataType: PropertyDataType.float,
        name: 'Teplota',
        propertyClass: PropertyClass.Temperature,
        unitOfMeasurement: '°C',
    });

    const tempPresetProperty = nodeSwitch.addProperty({
        propertyId: 'tempPreset',
        dataType: PropertyDataType.float,
        name: 'Cíl',
        propertyClass: PropertyClass.Temperature,
        unitOfMeasurement: '°C',
        settable: true,
        callback: function (value) {
            if (value === 'true') sendData(commands.presetTemp(parseInt(value)));
            else sendData(commands.presetTemp(parseInt(value)));
        },
    });


    // client.on('close', function () {
    //     console.log('Connection closed');
    // });
    client.on('error', function (err: any) {
        if (err.code === 'ETIMEDOUT') {
            plat.publishStatus(DeviceStatus.alert);
        } else if (err.code === 'ECONNREFUSED') {
            plat.publishStatus(DeviceStatus.disconnected);
        } else
            logger.error(err);
    });
    // client.setKeepAlive(true, 5000);

    function sendData(payload: { type: number, data: string, sid?: string }): Promise<{ sid: string; data: string; result: 'ok'; type: number }> {
        return new Promise((resolve) => {
            client.connect(device.intexPort, device.intexIp, function () {
                // Add timestamp
                const command = prepareCommand(payload)

                client.write(command);

                function cb(message: Buffer) {
                    const jsonPayload = JSON.parse(message.toString());

                    client.destroy();
                    // remote itself to fix memory leak
                    client.removeListener("data", cb)

                    resolve(jsonPayload);
                }
                client.on('data', cb);
                plat.publishStatus(DeviceStatus.ready);
            });
        });
    }

    plat.init();
    async function sync(responseData?: string) {
        let data = responseData;
        if (!data) {
            const response = await sendData(commands.status);
            data = response.data;
        }

        const json = decodeData(data);
        bubblesProperty.setValue(json.bubbles.toString())
        nozzlesProperty.setValue(json.jets.toString())
        pumpProperty.setValue(json.filter.toString());
        switchProperty.setValue((json.filter && json.heater).toString())
        electrolysisProperty.setValue(json.sanitizer.toString())
        if (json.currentTemp) tempCurrentProperty.setValue(json.currentTemp.toString())
        tempPresetProperty.setValue(json.presetTemp.toString())
    }

    sync();
    const syncInterval = setInterval(() => sync(), 1000 * 60 * 5);

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