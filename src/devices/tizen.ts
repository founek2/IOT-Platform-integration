import { Platform, DeviceStatus, ComponentType, PropertyDataType } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { FactoryFn } from '../types.ts';
import SchemaValidator, { Type, string, number } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { CallbackFn } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/property.ts";
import { Samsung } from '../../samsung-tv-control/src/index.ts'
import KEYS from "../../samsung-tv-control/src/keys.ts";
import UPnPClient from '../../node-upnp/index.js'

// const ActionSchema = SchemaValidator({
//     name: string,
//     url: string
// })

export const Schema = SchemaValidator({
    tizenIp: string,
    tizenMac: string,
    tizenToken: string.optional(),
    tizenUpnpPort: number.optional(8081),
    //braviaActions: array.of(ActionSchema).optional()
})

type TizenConfig = Type<typeof Schema>;

// Working keys - KEY_VOLUP, KEY_VOLDOWN
// no Idea how to get current state -> even HA implementation is missing it, as well as app controll - not available in new Tizen version
const SVC_RENDERINGCONTROL = "urn:upnp-org:serviceId:RenderingControl"

export const factory: FactoryFn<TizenConfig> = function (config, device, logger, storage) {
    const configTizen = {
        debug: false, // Default: false
        ip: device.tizenIp,
        mac: device.tizenMac,
        nameApp: device.id, // Default: NodeJS
        port: 8002, // Default: 8002
        token: device.tizenToken,
    }

    const control = new Samsung(configTizen)
    const upnpClient = new UPnPClient({
        url: `http://${device.tizenIp}:9197/dmr`,
        eventsServerPort: device.tizenUpnpPort
    });

    control.on('token', (token: string) => {
        logger.warning(`Token has changed, new value is '${token}' - update it in config file!!!`)
    })

    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port, storage);

    function handleAction(cb: CallbackFn) {
        const fn: CallbackFn = async (newValue): Promise<boolean | void> => {
            try {
                return await cb(newValue)
            } catch (err) {
                if (err.message?.includes('status code: 403'))
                    logger.error('action failed, invalid pre-shared key.')
                else logger.error('action failed. Error:', err)
                plat.publishStatus(DeviceStatus.alert)
                return false;
            }
        }

        return fn;
    }

    function waitForAvailable(timeout: number = 5_000): Promise<boolean> {
        return new Promise((resolve) => {
            const interval = setInterval(async () => {
                if (await control.isAvailablePing()) {
                    clearInterval(interval);
                    resolve(true);
                }
            }, 1000)
            setTimeout(() => {
                clearInterval(interval)
                resolve(false)
            }, timeout);
        })

    }

    const nodeLight = plat.addNode('television', 'Televize', ComponentType.switch);
    const powerProperty = nodeLight.addProperty({
        propertyId: 'power',
        dataType: PropertyDataType.boolean,
        name: 'TV',
        settable: true,
        callback: handleAction(async (newValue) => {
            if (newValue === 'true') {
                await control.turnOn()
                if (await waitForAvailable()) {
                    return true
                } else return false
            } else {
                await control.sendKeyPromise(KEYS.KEY_POWER);
            }
            return true;
        }),
    });

    const volumeProperty = nodeLight.addProperty({
        propertyId: 'volume',
        dataType: PropertyDataType.integer,
        format: '0:80',
        name: 'TV',
        settable: true,
        callback: handleAction(async (newValue) => {
            await upnpClient.call(SVC_RENDERINGCONTROL, "SetVolume", { InstanceID: 0, Channel: "Master", DesiredVolume: parseInt(newValue) })
            return true
        })
    });

    const muteProperty = nodeLight.addProperty({
        propertyId: 'mute',
        dataType: PropertyDataType.boolean,
        name: 'Ztlumit',
        settable: true,
        callback: handleAction(async (newValue) => {
            if (newValue == "true")
                await upnpClient.call(SVC_RENDERINGCONTROL, "SetMute", { InstanceID: 0, Channel: "Master", DesiredMute: true })
            else
                await upnpClient.call(SVC_RENDERINGCONTROL, "SetMute", { InstanceID: 0, Channel: "Master", DesiredMute: false })
            return true
        }),
    });

    // if (device.braviaActions) {
    //     nodeLight.addProperty({
    //         propertyId: 'view',
    //         dataType: PropertyDataType.enum,
    //         format: [...device.braviaActions.map(v => v.name), "stop"].join(","),
    //         name: 'Zobrazit',
    //         settable: true,
    //         callback: handleAction(async (newValue) => {
    //             const action = device.braviaActions?.find(v => v.name === newValue)
    //             if (action) {
    //                 await exec(`catt --device ${device.braviaIp} cast_site "${action.url}"`)
    //                 return true
    //             }

    //             if (newValue === "stop") {
    //                 await exec(`catt --device ${device.braviaIp} stop`)
    //                 return true
    //             }

    //             return false;
    //         }),
    //     });
    // }

    plat.init();

    control.on('connect', () => {
        logger.debug('connected')
        if (powerProperty.getValue() != "true") powerProperty.setValue('true');
    });
    control.on('close', () => {
        logger.debug('disconnected')
        if (powerProperty.getValue() != "false") powerProperty.setValue('false');
    });

    async function syncStatus() {
        const isOn = await control.isAvailablePing()
        if (isOn) {
            if (powerProperty.getValue() != "true") powerProperty.setValue('true');
        }
        else {
            if (powerProperty.getValue() != "false") powerProperty.setValue('false');
        }
    }

    syncStatus();
    const syncInterval = setInterval(syncStatus, 3 * 60 * 1000);

    upnpClient.subscribe(SVC_RENDERINGCONTROL, (e: { instanceId: number, name: "Mute" | "Volume", value: number }) => {
        switch (e.name) {
            case "Mute":
                if (e.value == 0) muteProperty.setValue("false")
                else muteProperty.setValue("true")
                break;
            case "Volume":
                volumeProperty.setValue(e.value.toString())
                break;
        }
    })

    return {
        cleanUp: function () {
            clearInterval(syncInterval)
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