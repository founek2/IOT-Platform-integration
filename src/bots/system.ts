import * as si from 'npm:systeminformation';
import { Platform, ComponentType, PropertyDataType, PropertyClass } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { FactoryFn } from '../types.ts';

export const factory: FactoryFn = function (config, device, _logger, storage) {
    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port, storage);

    const nodeLight = plat.addNode('load', 'Systém', ComponentType.sensor);

    const loadProperty = nodeLight.addProperty({
        propertyId: 'load',
        dataType: PropertyDataType.float,
        unitOfMeasurement: '%',
        propertyClass: PropertyClass.Pressure,
        name: 'Zátěž',
    });
    const memoryProperty = nodeLight.addProperty({
        propertyId: 'memory',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'GiB',
        name: 'Paměť',
    });
    const cpuProperty = nodeLight.addProperty({
        propertyId: 'cpu',
        dataType: PropertyDataType.float,
        unitOfMeasurement: 'GHz',
        name: 'CPU',
    });

    plat.init();

    async function sendData() {
        const cpu = await si.cpu();
        const memory = await si.mem();
        const load = await si.currentLoad();

        memoryProperty.setValue((memory.active * 1e-9).toString().slice(0, 4))
        loadProperty.setValue(load.avgLoad.toString().slice(0, 4))
        cpuProperty.setValue(cpu.speed.toString())
    }

    const syncInterval = setInterval(() => {
        sendData();
    }, 60 * 1000);
    sendData();

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
    }
}