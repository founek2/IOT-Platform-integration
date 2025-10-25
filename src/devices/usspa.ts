import { Platform, DeviceStatus, ComponentType, PropertyDataType, PropertyClass } from "iot-platform/deno"
import { FactoryFn } from '../types.ts';
import SchemaValidator, { Type, string } from 'computed_types';
import { UsspaClient } from "./usspa/usspaClient.ts";

export const Schema = SchemaValidator({
    usspaSerialNumber: string,
    usspaPassword: string,
})

type YamahaConfig = Type<typeof Schema>;

export const factory: FactoryFn<YamahaConfig> = function (config, device, logger, storage) {
    const usspa = new UsspaClient(device.usspaSerialNumber, device.usspaPassword);

    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port, storage);

    const nodeLight = plat.addNode('control', 'Vířivka', ComponentType.switch);

    const filterProperty = nodeLight.addProperty({
        propertyId: 'pump',
        dataType: PropertyDataType.boolean,
        name: 'Filtrace',
        settable: true,
        callback: function (value) {
            return usspa.setFiltration(value === "true");
        },
    });

    // const switchProperty = nodeLight.addProperty({
    //     propertyId: 'switch',
    //     dataType: PropertyDataType.boolean,
    //     name: 'Ohřev',
    //     settable: true,
    //     callback: function () {

    //         return false;
    //     },
    // });
    const bubblesProperty = nodeLight.addProperty({
        propertyId: 'bubbles',
        dataType: PropertyDataType.boolean,
        name: 'Bubliny',
        settable: true,
        callback: function (value) {
            return usspa.setBubbles(value === "true")
        },
    });

    const nozzlesProperty = nodeLight.addProperty({
        propertyId: 'nozzles',
        dataType: PropertyDataType.boolean,
        name: 'Trysky',
        settable: true,
        callback: function (value) {
            return usspa.setNozzles(value === "true")
        },
    });
    const lightProperty = nodeLight.addProperty({
        propertyId: 'light',
        dataType: PropertyDataType.boolean,
        name: 'Světlo',
        settable: true,
        callback: function (value) {
            return usspa.setLight(value === "true")
        },
    });
    const heaterProperty = nodeLight.addProperty({
        propertyId: 'heater',
        dataType: PropertyDataType.boolean,
        name: 'Ohřev',
    });

    const errorProperty = nodeLight.addProperty({
        propertyId: 'error',
        dataType: PropertyDataType.string,
        name: 'Chyba',
    });

    const nodeSwitch = plat.addNode('sensor', 'Vířivka teplota', ComponentType.sensor);
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
        settable: true,
        callback: function (value) {
            return usspa.setTempPreset(value)
        },
    });

    plat.init();

    async function syncPlatform() {
        try {
            const data = await usspa.sync()
            if (!data) return;

            if (data.filtration) filterProperty.setValue(data.filtration != "0" ? "true" : "false")
            if (data.actualTemp) tempCurrentProperty.setValue(data.actualTemp)
            if (data.reqTemp) tempPresetProperty.setValue(data.reqTemp)
            if (data.pump2) nozzlesProperty.setValue(data.pump2 == "1" ? "true" : "false")
            if (data.pump3) bubblesProperty.setValue(data.pump3 == "1" ? "true" : "false")
            if (data.light1) lightProperty.setValue(data.light1 == "1" ? "true" : "false")
            if (data.heater) heaterProperty.setValue(data.heater == "1" ? "true" : "false")
        } catch (e: any) {
            if (e.code === 'EHOSTUNREACH' || e.code === 'ETIMEDOUT') {
                plat.publishStatus(DeviceStatus.alert);
            } else logger.error(e);
        }
    }

    async function login() {
        const result = await usspa.login()
        if (!result) {
            logger.error("Failed to login, probably invalid password");
        }
    }

    login().then(() => syncPlatform())
    const syncInterval = setInterval(syncPlatform, 5 * 60 * 1000);

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