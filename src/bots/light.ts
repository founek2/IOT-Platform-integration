import { Platform } from '../lib/connection';
import { ComponentType, PropertyDataType } from '../lib/type';

const ONE_HOUR = 60 * 60 * 1000;
function generateNextChangeTimeout() {
    return Math.floor(Math.random() * 2 * ONE_HOUR + ONE_HOUR);
}

async function main() {
    const plat = new Platform('BOT-91JK123', 'martas', 'Světlo');
    const nodeLight = plat.addNode('light', 'Světlo', ComponentType.switch);
    nodeLight.addProperty({
        propertyId: 'power',
        dataType: PropertyDataType.boolean,
        name: 'Světlo',
        settable: true,
    });

    plat.on('connect', (client) => {
        console.log('sending data');
        let currentState = false;

        function sendChangeAfter(miliseconds: number = 0) {
            setTimeout(() => {
                currentState = !currentState;
                plat.publishData('light', 'power', currentState.toString());

                const nextIn = generateNextChangeTimeout();
                sendChangeAfter(nextIn);
            }, miliseconds);
        }

        sendChangeAfter();

        // plat.publishSensorData("volt", "11");
        // plat.publishSensorData("temp", "21.1");
        // plat.publishSensorData("hum", "74");
        // plat.publishSensorData("power", "0");

        // plat.publishData('light', 'power', 'true');

        // sendRate();
        // setInterval(sendRate, 2000);
        // plat.publishData('center', 'currency', 'ETH');
    });
    plat.init();
}

main();
