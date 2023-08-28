import config from '../config.ts';
import { Platform } from "https://raw.githubusercontent.com/founek2/IOT-Platforma-zigbee/master/src/lib/connection.ts"
import { ComponentType, PropertyDataType } from "https://raw.githubusercontent.com/founek2/IOT-Platforma-zigbee/master/src/lib/type.ts"

const ONE_HOUR = 60 * 60 * 1000;
function generateNextChangeTimeout() {
    return Math.floor(Math.random() * 2 * ONE_HOUR + ONE_HOUR);
}


const plat = new Platform('BOT-91JK123', 'martas', 'Světlo', config.MQTT_SERVER_URL, config.MQTT_SERVER_PORT);
const nodeLight = plat.addNode('light', 'Světlo', ComponentType.switch);
const powerProperty = nodeLight.addProperty({
    propertyId: 'power',
    dataType: PropertyDataType.boolean,
    name: 'Světlo',
    settable: true,
});

plat.init();

let currentState = false;

function sendChangeAfter(miliseconds = 0) {
    setTimeout(() => {
        currentState = !currentState;
        powerProperty.setValue(currentState.toString())

        const nextIn = generateNextChangeTimeout();
        sendChangeAfter(nextIn);
    }, miliseconds);
}

sendChangeAfter();

