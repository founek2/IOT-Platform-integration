import { Generic, Option } from "./exposes.ts";

// source https://github.com/Koenkk/zigbee2mqtt/blob/master/lib/types/api.ts

export type DeviceType = 'Coordinator' | 'Router' | 'EndDevice' | 'Unknown' | 'GreenPower';

export interface Device {
    ieee_address: string;
    type: DeviceType
    network_address: number;
    supported: boolean;
    friendly_name: string;  // z2m defaults to ieee_address
    disabled: boolean;
    description: string | undefined;
    definition: DeviceDefinition | undefined;
    power_source: string | undefined;
    software_build_id: string | undefined;
    date_code: string | undefined;
    model_id: string | undefined;
    interviewing: boolean;
    interview_completed: boolean;
    manufacturer: string;
    endpoints: any; // not important for now
}
export interface DeviceDefinition {
    model: string;
    vendor: string;
    // contains device full name
    description: string;
    exposes: Generic[];
    supports_ota: boolean;
    options: Option[];
    icon: string;
}