import { Platform } from '../lib/connection';
import { ComponentType, PropertyDataType, PropertyClass } from '../lib/type';
import { Socket } from 'net';
import { decodeData, PumpState } from './spaDecoder';

const config = {
    spaIp: process.env.SPA_IP as string,
    spaPort: Number(process.env.SPA_PORT),
};
console.log('config', config);

if (!config.spaIp) console.error('INVALID spa IP');

if (!config.spaPort) console.error('INVALID spa PORT');

if (!config.spaPort || !config.spaIp) process.exit(1);

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

async function main() {
    const plat = new Platform('BOT-9011CC', 'martas', 'Spáčko');
    const nodeLight = plat.addNode('control', 'Vířivka', ComponentType.switch);
    nodeLight.addProperty({
        propertyId: 'switch',
        dataType: PropertyDataType.boolean,
        name: 'Ohřev',
        settable: true,
        callback: async function (prop) {
            const response = await sendData(FiltrationAndHeater.off);
            sync(response.data);
        },
    });
    nodeLight.addProperty({
        propertyId: 'bubbles',
        dataType: PropertyDataType.boolean,
        name: 'Bubliny',
        settable: true,
        callback: async function (prop) {
            const response = await sendData(Bubbles.on);
            sync(response.data);
        },
    });

    nodeLight.addProperty({
        propertyId: 'nozzles',
        dataType: PropertyDataType.boolean,
        name: 'Trysky',
        settable: true,
        callback: async function (prop) {
            const response = await sendData(Nozzles.on);
            sync(response.data);
        },
    });

    nodeLight.addProperty({
        propertyId: 'pump',
        dataType: PropertyDataType.boolean,
        name: 'Filtrace',
        settable: true,
        callback: async function (prop) {
            const response = await sendData(Filtration.on);
            sync(response.data);
        },
    });

    nodeLight.addProperty({
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
    nodeSwitch.addProperty({
        propertyId: 'tempCurrent',
        dataType: PropertyDataType.float,
        name: 'Teplota',
        propertyClass: PropertyClass.Temperature,
        unitOfMeasurement: '°C',
    });

    nodeSwitch.addProperty({
        propertyId: 'tempPreset',
        dataType: PropertyDataType.float,
        name: 'Cíl',
        propertyClass: PropertyClass.Temperature,
        unitOfMeasurement: '°C',
    });

    // plat.publishData("volt", "11");
    // plat.on('connect', (client) => {});
    plat.init();

    // const response = await sendData(StatusPayload);
    // console.log('res', response, decodeData(response.data));

    async function sync(responseData?: string) {
        let data = responseData;
        if (!data) {
            const response = await sendData(StatusPayload);
            data = response.data;
        }

        const json = decodeData(data);
        plat.publishData('control', 'bubbles', json.bubbles.toString());
        plat.publishData('control', 'nozzles', json.nozzles.toString());
        plat.publishData('control', 'pump', json.pump.toString());
        plat.publishData('control', 'switch', (json.pumpState == PumpState.pumpAndHeater).toString());
        plat.publishData('control', 'electrolysis', json.electrolysis.toString());

        plat.publishData('sensor', 'tempCurrent', json.currentTemp.toString());
        plat.publishData('sensor', 'tempPreset', json.presetTemp.toString());
    }

    sync();
    setInterval(() => sync(), 1000 * 60 * 5);
}

main();

// client.on('data', function (data) {
//     console.log('Received: ' + data);
//     client.destroy(); // kill client after server's response
// });
// client.connect(config.spaPort, config.spaIp)

client.on('close', function () {
    console.log('Connection closed');
});
client.on('error', function (err) {
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
        });
    });
}
