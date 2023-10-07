import config from '../config.ts';
import { Platform, ComponentType, PropertyDataType, PropertyClass } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"

function generateTemp(previousTemp: number = 20) {
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


const plat = new Platform('BOT-423D1', 'martas', 'Meteostanice', config.MQTT_SERVER_URL, config.MQTT_SERVER_PORT);
const node = plat.addNode('light', 'Světlo', ComponentType.switch);
const powerProperty = node.addProperty({
    propertyId: 'power',
    dataType: PropertyDataType.boolean,
    name: 'Světlo',
    settable: true,
    callback: (newValue) => {
        console.log('recieved light:', newValue);
    },
});

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

const nodeLGate = plat.addNode('gate', 'Brána', ComponentType.activator);
const powerGateProp = nodeLGate.addProperty({
    propertyId: 'power',
    dataType: PropertyDataType.enum,
    name: 'Brána',
    settable: true,
    format: 'on',
    callback: (newValue) => {
        console.log('recieved gate:', newValue);
    },
});

plat.init();

voltProperty.setValue("11");
tempProperty.setValue("21.6");
humProperty.setValue("74");
pressProperty.setValue("112");
temp2Property.setValue("15.4");

let lastTemp = 20;
setInterval(() => {
    lastTemp = generateTemp(lastTemp);
    tempProperty.setValue(lastTemp.toFixed(1));
}, generateNextChangeTimeout());
