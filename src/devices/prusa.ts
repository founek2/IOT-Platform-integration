import { Platform, DeviceStatus, ComponentType, PropertyDataType } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { FactoryFn } from '../types.ts';
import SchemaValidator, { Type, string } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { PrusaLink, PrusaLinkConfig } from "npm:@jamesgopsill/prusa-link"

export const Schema = SchemaValidator({
    prusaIp: string,
    prusaUserName: string,
    prusaPassword: string
})

type BraviaConfig = Type<typeof Schema>;

const stateToText: { [text: string]: string } = {
    IDLE: 'Nečinné', BUSY: 'Zaneprázděno', PRINTING: 'Tisknu', PAUSED: 'Pozastaveno', FINISHED: 'Dokončeno', STOPPED: 'Zastaveno', ERROR: 'Chyba', ATTENTION: 'Pozor!', READY: 'Připraveno'
}

export const factory: FactoryFn<BraviaConfig> = function (config, device, logger, storage) {
    const prusaConfig: PrusaLinkConfig = {
        ip: device.prusaIp,
        username: device.prusaUserName,
        password: device.prusaPassword,
        debug: false,
    }

    const link = new PrusaLink(prusaConfig)
    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port, storage);

    const nodeLight = plat.addNode('printer', '3D tiskárna', ComponentType.sensor);
    const timeProperty = nodeLight.addProperty({
        propertyId: 'timeRemaining',
        dataType: PropertyDataType.integer,
        name: 'Zbývá',
        unitOfMeasurement: 'min',
    });

    const progressProperty = nodeLight.addProperty({
        propertyId: 'progress',
        dataType: PropertyDataType.float,
        name: 'Vytisknuto',
        unitOfMeasurement: '%',
    });

    const timePrintingProperty = nodeLight.addProperty({
        propertyId: 'timePrinting',
        dataType: PropertyDataType.integer,
        name: 'Již tisknu',
        unitOfMeasurement: 'min',
    });

    const tempProperty = nodeLight.addProperty({
        propertyId: 'nozzleTemperature',
        dataType: PropertyDataType.float,
        name: 'Teplota trysky',
        unitOfMeasurement: '°C',
    });


    const stateProperty = nodeLight.addProperty({
        propertyId: 'state',
        dataType: PropertyDataType.string,
        name: 'Stav',
    });

    plat.init();

    async function syncPlatform() {
        try {
            const status = await link.status.get();
            if (status.ok == false) {
                if (plat.status != DeviceStatus.disconnected) plat.publishStatus(DeviceStatus.disconnected);
                return;
            }

            const printer = status.content?.printer;
            const job = status.content?.job;
            if (job) {
                progressProperty.setValue(job.progress.toString())
                timeProperty.setValue((job.timeRemaining / 60).toFixed(0).toString())
                timePrintingProperty.setValue((job.timePrinting / 60).toFixed(0).toString())
            } else {
                if (timeProperty.getValue() != '') timeProperty.setValue('');
            }
            if (printer) {
                if (printer.state == 'FINISHED') {
                    if (progressProperty.getValue() != '100') progressProperty.setValue('100');
                    if (timeProperty.getValue() != '0') timeProperty.setValue('0');
                }
                stateProperty.setValue(stateToText[printer.state])

                if (printer.tempNozzle) tempProperty.setValue(printer.tempNozzle.toString())
            }

            if (plat.status != DeviceStatus.ready) plat.publishStatus(DeviceStatus.ready);
        } catch (e: any) {
            if (plat.status != DeviceStatus.disconnected) plat.publishStatus(DeviceStatus.disconnected);
        }
    }

    syncPlatform();
    const syncInterval = setInterval(syncPlatform, 3 * 60 * 1000);

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