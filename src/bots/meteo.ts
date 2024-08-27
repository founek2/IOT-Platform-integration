import { Platform, ComponentType, PropertyDataType, PropertyClass } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { FactoryFn } from '../types.ts';

function generateTemp(previousTemp = 20) {
    const change = Math.random() / 2;

    if (previousTemp <= 10) {
        return previousTemp + change;
    }
    if (previousTemp >= 35) {
        return previousTemp - change;
    }
    if (Math.random() < 0.5) return previousTemp + change;

    return previousTemp - change;
}
const ONE_HOUR = 60 * 60 * 1000;
function generateNextChangeTimeout() {
    return Math.floor(Math.random() * ONE_HOUR);
}

export const factory: FactoryFn = function (config, device, _logger, storage) {
    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port, storage);

    const node2 = plat.addNode('meteo', 'Meteo', ComponentType.sensor);

    const tempProperty = node2.addProperty({
        name: 'Teplota',
        propertyId: 'temp',
        propertyClass: PropertyClass.Temperature,
        unitOfMeasurement: '°C',
        dataType: PropertyDataType.float,
    });
    const humProperty = node2.addProperty({
        propertyId: 'hum',
        propertyClass: PropertyClass.Humidity,
        unitOfMeasurement: '%',
        name: 'Vlhkost',
        dataType: PropertyDataType.float,
    });
    const voltProperty = node2.addProperty({
        propertyId: 'volt',
        propertyClass: PropertyClass.Voltage,
        unitOfMeasurement: 'V',
        name: 'Napětí',
        dataType: PropertyDataType.float,
    });
    const pressProperty = node2.addProperty({
        propertyId: 'press',
        propertyClass: PropertyClass.Pressure,
        unitOfMeasurement: 'hPa',
        name: 'Tlak',
        dataType: PropertyDataType.float,
    });

    const temp2Property = node2.addProperty({
        propertyId: 'temp2',
        propertyClass: PropertyClass.Temperature,
        unitOfMeasurement: '*C',
        name: 'Teplota2',
        dataType: PropertyDataType.float,
    });

    plat.init();

    voltProperty.setValue("11");
    tempProperty.setValue("21.6");
    humProperty.setValue("74");
    pressProperty.setValue("112");
    temp2Property.setValue("15.4");

    let lastTemp = 20;
    const syncInterval = setInterval(() => {
        lastTemp = generateTemp(lastTemp);
        tempProperty.setValue(lastTemp.toFixed(1));
    }, generateNextChangeTimeout());

    return {
        cleanUp: function () {
            clearTimeout(syncInterval)
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