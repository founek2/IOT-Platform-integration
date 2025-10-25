import { ComponentType, PropertyDataType, Platform } from "iot-platform/deno"
import { FactoryFn } from '../types.ts';

const ONE_HOUR = 60 * 60 * 1000;
function generateNextChangeTimeout() {
    return Math.floor(Math.random() * 6 * ONE_HOUR + ONE_HOUR);
}

export const factory: FactoryFn = function (config, device, _logger, storage) {
    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port, storage);

    const nodeLight = plat.addNode('gate', 'Brána', ComponentType.activator);
    const gateProperty = nodeLight.addProperty({
        propertyId: 'power',
        dataType: PropertyDataType.enum,
        name: 'Brána',
        format: "on",
        settable: true,
    });

    plat.init();

    let currentState = false;

    let sendTimeout: number;
    function sendChangeAfter(miliseconds = 0) {
        sendTimeout = setTimeout(() => {
            currentState = !currentState;
            gateProperty.setValue("on")

            const nextIn = generateNextChangeTimeout();
            sendChangeAfter(nextIn);
        }, miliseconds);
    }
    sendChangeAfter();

    return {
        cleanUp: function () {
            clearTimeout(sendTimeout)
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