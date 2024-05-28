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
        callback: function () {
            sendData(commands.heater);

            return false;
        },
    });
    const bubblesProperty = nodeLight.addProperty({
        propertyId: 'bubbles',
        dataType: PropertyDataType.boolean,
        name: 'Bubliny',
        settable: true,
        callback: function () {
            sendData(commands.bubbles);

            return false;
        },
    });

    const nozzlesProperty = nodeLight.addProperty({
        propertyId: 'nozzles',
        dataType: PropertyDataType.boolean,
        name: 'Trysky',
        settable: true,
        callback: function () {
            sendData(commands.jets);

            return false;
        },
    });

    const pumpProperty = nodeLight.addProperty({
        propertyId: 'pump',
        dataType: PropertyDataType.boolean,
        name: 'Filtrace',
        settable: true,
        callback: function () {
            sendData(commands.filter);

            return false;
        },
    });

    const electrolysisProperty = nodeLight.addProperty({
        propertyId: 'sanitizer',
        dataType: PropertyDataType.boolean,
        name: 'Elektrolýza',
        settable: true,
        callback: function () {
            sendData(commands.sanitizer);

            return false;
        },
    });

    const errorProperty = nodeLight.addProperty({
        propertyId: 'error',
        dataType: PropertyDataType.string,
        name: 'Chyba',
    });

    const nodeSwitch = plat.addNode('sensor', 'Výřivka teplota', ComponentType.sensor);
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
            const temperature = parseInt(value)
            if (!Number.isFinite(temperature) || !Number.isInteger(temperature)) return false;
            if (temperature < 0 || temperature > 40) return false;

            sendData(commands.presetTemp(temperature));

            return false;
        },
    });


    function publishStatus(status: DeviceStatus) {
        if (plat.status !== status)
            plat.publishStatus(status);
    }

    let hasBeenEverConnected = false;
    client.on('error', function (err: any) {
        if (hasBeenEverConnected) {
            publishStatus(DeviceStatus.alert)
            return;
        }

        if (err.code === 'ETIMEDOUT') {
            publishStatus(DeviceStatus.alert)
        } else if (err.code === 'ECONNREFUSED') {
            publishStatus(DeviceStatus.disconnected)
        } else
            logger.error(err);

        client.end();
    });

    client.on('data', (message: Buffer) => {
        const jsonPayload = JSON.parse(message.toString());

        if (jsonPayload.type != 2) {
            client.end()
            return;
        }
        const json = decodeData(jsonPayload.data);
        bubblesProperty.setValue(json.bubbles.toString())
        nozzlesProperty.setValue(json.jets.toString())
        pumpProperty.setValue(json.filter.toString());
        switchProperty.setValue((json.filter && json.heater).toString())
        electrolysisProperty.setValue(json.sanitizer.toString())
        if (json.currentTemp) tempCurrentProperty.setValue(json.currentTemp.toString())
        tempPresetProperty.setValue(json.presetTemp.toString())

        if (json.errorCode) {
            plat.publishStatus(DeviceStatus.alert)
            errorProperty.setValue(json.errorCode)
        }
        else {
            publishStatus(DeviceStatus.ready);
            if (errorProperty.getValue()) {
                errorProperty.setValue("")
            }
        }

        client.end();
    });

    let commandToSend: string | undefined;
    client.on("connect", function () {
        hasBeenEverConnected = true;
        if (!commandToSend) return;

        client.write(commandToSend);
        commandToSend = undefined;
    })

    type DataPayload = { type: number, data: string, sid?: string };
    function sendData(payload: DataPayload): void {
        commandToSend = prepareCommand(payload);
        client.connect(device.intexPort, device.intexIp);
    }

    let counter = 0;
    function sync() {
        if (counter < 4) {
            sendData(commands.status);
            counter++;
        } else {
            // setting temp should force temperature update
            const tempPreset = tempPresetProperty.getValue();
            if (tempPreset) sendData(commands.presetTemp(Number(tempPreset)));
            counter = 0;
        }
    }

    plat.init();
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