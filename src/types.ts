import { Logger } from "https://raw.githubusercontent.com/founek2/IOT-Platforma-zigbee/master/src/lib/mod.ts"
import SchemaValidator, { Type, string, number, unknown } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';

export const SchemaGeneral = SchemaValidator({
    userName: string,
    mqtt: {
        uri: string,
        port: number.optional(1883),
    },
    bridges: unknown.object().optional(),
    devices: unknown.object().optional()
})

export interface mqttConfig {
    uri: string
    port: number
    prefix?: string
}
export type ConfigGeneral = Type<typeof SchemaGeneral>;
export type DeviceConfig = Pick<ConfigGeneral, "userName" | "mqtt">;

export interface DeviceBase {
    name: string
    type: string
}
export type Device<T = Record<string | number | symbol, never>> = DeviceBase & { id: string } & T

export type ConfigDevice = DeviceBase & { [key: string]: any };
export interface Config extends Omit<ConfigGeneral, "bridges" | "devices"> {
    bridges?: Record<string, ConfigDevice>
    devices?: Record<string, ConfigDevice>
}

export type FactoryReturn = {
    cleanUp: () => void | Promise<void>
};
export type FactoryFn<T = Record<string | number, string | number>> = (config: DeviceConfig, device: Device<Device<T>>, log: Logger) => FactoryReturn | Promise<FactoryReturn>;
export interface Module {
    factory: FactoryFn
    Schema?: {
        validator: (object: any) => any
    }
}