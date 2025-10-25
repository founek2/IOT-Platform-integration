import { Platform, ComponentType, PropertyDataType } from "iot-platform/deno"
import { FactoryFn } from '../types.ts';
import SchemaValidator, { Type, string, array } from 'computed_types';

const ActionSchema = SchemaValidator({
    mqttTopic: string,
    mqttValue: string,
    smsNumber: string,
    smsValue: string
})

export const Schema = SchemaValidator({
    basicAuth: string,
    endpoint: string,
    fromNumber: string,
    smsActions: array.of(ActionSchema).optional()
})

type BraviaConfig = Type<typeof Schema>;

export const factory: FactoryFn<BraviaConfig> = function (config, device, logger, storage) {
    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port, storage);

    const nodeLight = plat.addNode('sms', 'Sms', ComponentType.sensor);
    const smsSendProperty = nodeLight.addProperty({
        propertyId: 'sendSms',
        dataType: PropertyDataType.enum,
        format: "true",
        name: 'SMS odesláno',
    });

    plat.init();
    console.log(plat.status)

    if (device.smsActions) {
        for (const action of device.smsActions) {
            logger.debug("Subscribing to", action.mqttTopic)
            plat.subscribeTopic(action.mqttTopic)
        }

        plat.on("message", (topic, payload) => {
            const value = payload.toString();
            console.log("handling", topic, value)
            for (const action of device.smsActions!) {
                console.log("handling", topic, value)
                if (topic == action.mqttTopic && value == action.mqttValue) {
                    logger.info("sending sms to", action.smsNumber)
                    sendMessageViaTwillio(device.endpoint, device.fromNumber, action.smsNumber, action.smsValue, device.basicAuth)
                        .then(res => {
                            if (res.ok) {
                                smsSendProperty.setValue("true")
                            } else {
                                throw new Error(`Invalid http status ${res.status}`)
                            }
                        }).catch(e => {
                            logger.error("Failed to send sms", e.message)
                        })
                }
            }
        })
    }

    return {
        cleanUp: function () {
            plat.disconnect()
        },
        healthCheck: function () {
            return {
                deviceId: plat.deviceId,
                connected: plat.client.connected
            }
        }
    };
}

function sendMessageViaTwillio(endpoint: string, fromNumber: string, toNumber: string, value: string, auth: string) {
    return fetch(endpoint, {
        method: "POST",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            "Authorization": `Basic ${btoa(auth)}`,
        },
        body: new URLSearchParams({
            'To': toNumber,
            'From': fromNumber,
            'Body': value,
        })
    })
}