import * as si from 'npm:systeminformation';
import config from '../config.ts';
import { Platform, ComponentType, PropertyDataType, PropertyClass } from "https://raw.githubusercontent.com/founek2/IOT-Platforma-zigbee/master/src/lib/mod.ts"

// console.log("load", await si.cpu());
const plat = new Platform('system-993D1', 'martas', 'Systém', config.MQTT_SERVER_URL, config.MQTT_SERVER_PORT);
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
    unitOfMeasurement: '%',
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
    const data6 = await si.currentLoad();

    memoryProperty.setValue((memory.active / memory.total).toString().slice(0, 4))
    loadProperty.setValue(Math.floor(data6.cpus[0].load).toString())
    cpuProperty.setValue(cpu.speed.toString())
}
setInterval(() => {
    sendData();
}, 60 * 1000);

sendData();

