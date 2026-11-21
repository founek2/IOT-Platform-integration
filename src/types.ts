import { Logger } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { z } from "zod";
import { ILocalStorage } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/storage.ts";

export enum ModuleType {
    devices = "devices",
    bridges = "bridges",
    bots = "bots",
    custom = "custom",
}

export function optional<T extends z.ZodType>(schema: T) {
    return z.preprocess((value) => {
        if (value === null) return undefined;
        return value;
    }, schema.optional());
}

export function withDefault<T extends z.ZodType>(schema: T, defaultValue: z.output<T>) {
    return z.preprocess((value) => {
        if (value === null || value === undefined) return defaultValue;
        return value;
    }, schema);
}

const configSection = optional(z.record(z.string(), z.unknown()));
export const SchemaGeneral = z.object({
    userName: z.string(),
    mqtt: z.object({
        uri: z.string(),
        port: withDefault(z.number(), 1883),
    }),
    [ModuleType.bridges]: configSection,
    [ModuleType.devices]: configSection,
    [ModuleType.bots]: configSection,
    [ModuleType.custom]: configSection,
});

export interface mqttConfig {
    uri: string
    port: number
    prefix?: string
}
export type ConfigGeneral = z.infer<typeof SchemaGeneral>;
export type DeviceConfig = Pick<ConfigGeneral, "userName" | "mqtt">;

export interface DeviceBase {
    name: string
    type: string
}
export type Device<T = Record<string | number | symbol, never>> = DeviceBase & { id: string } & T

export type ConfigDevice = DeviceBase & Record<string, unknown>;
export type Config = ConfigGeneral;

export interface HealthCheck {
    deviceId: string,
    status?: string,
    connected: boolean,
}
export type FactoryReturn = {
    cleanUp: () => void | Promise<void>
    healthCheck: () => HealthCheck | HealthCheck[]
};
export type FactoryFn<T = Record<string, unknown>> = (config: DeviceConfig, device: Device<Device<T>>, log: Logger, storage: ILocalStorage) => FactoryReturn | Promise<FactoryReturn>;
export interface Module {
    factory: FactoryFn
    Schema?: z.ZodType
}