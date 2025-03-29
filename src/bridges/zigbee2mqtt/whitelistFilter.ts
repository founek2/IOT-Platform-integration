import { Device } from "./types/device.ts";

export function filterByWhitelist(whitelist: Array<string>) {
    return function (device: Device): boolean {
        return device.friendly_name && whitelist?.includes(device.friendly_name) || whitelist?.includes(device.ieee_address)
    }
}