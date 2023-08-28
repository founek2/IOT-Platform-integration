import globalConfig from '../config.ts';
import { Platform, ComponentType, PropertyDataType, PropertyClass, DeviceStatus } from "https://raw.githubusercontent.com/founek2/IOT-Platforma-zigbee/master/src/lib/mod.ts"
import { Socket } from 'node:net';
import { decodeData, PumpState } from './spaDecoder.ts';
import { assert } from "https://deno.land/std@0.200.0/assert/mod.ts";

const config = {
    spaIp: Deno.env.get("SPA_IP") as string,
    spaPort: Number(Deno.env.get("SPA_PORT")),
};

assert(config.spaIp, 'missing env SPA_IP');
assert(Number.isFinite(config.spaPort), 'missing env SPA_PORT');

const client = new Socket();

const Bubbles = {
    on: {
        type: 1,
        sid: '1616871584000',
        data: '8888060F010400D4',
    },
    off: {
        type: 1,
        sid: '1616871589000',
        data: '8888060F010400D4',
    },
};

const Power = {
    on: { data: '8888060F01400098', sid: '1631357332538', type: 1 },
    off: { data: '8888060F01400098', sid: '1631357332538', type: 1 },
};

const Filtration = {
    on: { data: '8888060F010004D4', sid: '1626776247245', type: 1 },
    off: { data: '8888060F010004D4', sid: '1626776247245', type: 1 },
};

const FiltrationAndHeater = {
    on: { data: '8888060F010010C8', sid: '1631356889267', type: 1 },
    off: { data: '8888060F010010C8', sid: '1631356889267', type: 1 },
};

// current temp OUTPUT[45:47], presetTemp OUTPUT[61:63]
const StatusPayload = { data: '8888060FEE0F01DA', sid: '1630705186378', type: 1 };

const Nozzles = {
    on: JSON.stringify({
        type: 1,
        sid: '1631356889267',
        data: '8888060F011000C8',
    }),
    off: JSON.stringify({
        type: 1,
        sid: '1631356889267',
        data: '8888060F011000C8',
    }),
};

const plat = new Platform('BOT-9011CC', 'martas', 'Spáčko', globalConfig.MQTT_SERVER_URL, globalConfig.MQTT_SERVER_PORT);


const nodeLight = plat.addNode('control', 'Vířivka', ComponentType.switch);

const switchProperty = nodeLight.addProperty({
    propertyId: 'switch',
    dataType: PropertyDataType.boolean,
    name: 'Ohřev',
    settable: true,
    callback: async function (prop) {
        const response = await sendData(FiltrationAndHeater.off);
        sync(response.data);
    },
});
const bubblesProperty = nodeLight.addProperty({
    propertyId: 'bubbles',
    dataType: PropertyDataType.boolean,
    name: 'Bubliny',
    settable: true,
    callback: async function (prop) {
        const response = await sendData(Bubbles.on);
        sync(response.data);
    },
});

const nozzlesProperty = nodeLight.addProperty({
    propertyId: 'nozzles',
    dataType: PropertyDataType.boolean,
    name: 'Trysky',
    settable: true,
    callback: async function (prop) {
        const response = await sendData(Nozzles.on);
        sync(response.data);
    },
});

const pumpProperty = nodeLight.addProperty({
    propertyId: 'pump',
    dataType: PropertyDataType.boolean,
    name: 'Filtrace',
    settable: true,
    callback: async function (prop) {
        const response = await sendData(Filtration.on);
        sync(response.data);
    },
});

const electrolysisProperty = nodeLight.addProperty({
    propertyId: 'electrolysis',
    dataType: PropertyDataType.boolean,
    name: 'Elektrolýza',
    // settable: true,
    // callback: function (prop) {
    // if (prop.value === 'true') sendData(Alimentation.on);
    // else sendData(Alimentation.off);
    // },
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
});


client.on('close', function () {
    console.log('Connection closed');
});
client.on('error', function (err: any) {
    if (err.code === 'ETIMEDOUT') {
        plat.publishStatus(DeviceStatus.alert);
    }
    console.error(err);
});
// client.setKeepAlive(true, 5000);

function sendData(payload: any): Promise<{ sid: string; data: string; result: 'ok'; type: number }> {
    return new Promise((resolve) => {
        client.connect(config.spaPort, config.spaIp, function () {
            client.write(JSON.stringify(payload));

            client.on('data', (message) => {
                const jsonPayload = JSON.parse(message.toString());
                resolve(jsonPayload);
                client.destroy();
            });
            plat.publishStatus(DeviceStatus.ready);
        });
    });
}

plat.init();

async function sync(responseData?: string) {
    let data = responseData;
    if (!data) {
        const response = await sendData(StatusPayload);
        data = response.data;
    }

    const json = decodeData(data);
    bubblesProperty.setValue(json.bubbles.toString())
    nozzlesProperty.setValue(json.nozzles.toString())
    pumpProperty.setValue(json.pump.toString());
    switchProperty.setValue((json.pumpState == PumpState.pumpAndHeater).toString())
    electrolysisProperty.setValue(json.electrolysis.toString())
    tempCurrentProperty.setValue(json.currentTemp.toString())
    tempPresetProperty.setValue(json.presetTemp.toString())
}

sync();
setInterval(() => sync(), 1000 * 60 * 5);