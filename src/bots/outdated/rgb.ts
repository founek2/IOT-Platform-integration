import config from '../config.ts';
import { Platform, ComponentType, PropertyDataType } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"


const plat = new Platform('BOT-91JK113', 'martas', 'RGB Světlo', config.MQTT_SERVER_URL, config.MQTT_SERVER_PORT);
const nodeLight = plat.addNode('light', 'RGB Světlo', ComponentType.switch);
nodeLight.addProperty({
    propertyId: 'power',
    dataType: PropertyDataType.boolean,
    name: 'Světlo',
    settable: true,
});

nodeLight.addProperty({
    propertyId: 'color',
    dataType: PropertyDataType.color,
    name: 'Barva',
    settable: true,
    retained: true,
});

nodeLight.addProperty({
    propertyId: 'bright',
    dataType: PropertyDataType.integer,
    format: '0:100',
    name: 'Jas',
    settable: true,
    retained: true,
});

const nodeVolume = plat.addNode('reciever', 'Reciever', ComponentType.generic);
nodeVolume.addProperty({
    propertyId: 'volume',
    dataType: PropertyDataType.integer,
    format: '0:100',
    name: 'Hlasitost',
    settable: true,
    retained: true,
});

nodeVolume.addProperty({
    propertyId: 'power',
    dataType: PropertyDataType.boolean,
    name: 'Zapnuto',
    settable: true,
    retained: true,
});

nodeVolume.addProperty({
    propertyId: 'input',
    dataType: PropertyDataType.enum,
    format: 'air_play,net_radio,air_play,jack',
    name: 'Vstup',
    settable: true,
    retained: true,
});

plat.init();
