
export interface Device {
    definition: DeviceDefinition | null;
    ieee_address: string;
    friendly_name: string;  // z2m defaults to ieee_address
}
export interface DeviceDefinition {
    // contains device full name
    description: string;
    model: string;
    vendor: string;
    exposes: (DeviceExposesGeneric | DeviceExposesSwitch)[];
}

export interface DeviceExposesText {
    type: "text";
    access: number;
    name: string;
    label?: string;
    property: string;
    description: string;
}
export interface DeviceExposesEnum {
    type: "enum";
    access: number;
    name: string;
    label?: string;
    property: string;
    description: string;
    values?: string[];
}

export interface DeviceExposesNumeric {
    type: "numeric";
    access: number;
    name: string;
    label?: string;
    property: string;
    description: string;
    unit?: string;
    value_max?: number;
    value_min?: number;
}

export interface DeviceExposesBinary {
    type: "binary";
    access: number;
    name: string;
    label?: string;
    property: string;
    description: string;
    value_off: string | boolean;
    value_on: string | boolean;
}

export interface DeviceExposesComposite {
    type: "composite";
    access: number;
    name: string;
    label?: string;
    description: string;
    property: string;
    features: DeviceExposesText | DeviceExposesEnum | DeviceExposesNumeric | DeviceExposesBinary
}

export type DeviceExposesGeneric =
    | DeviceExposesBinary
    | DeviceExposesNumeric
    | DeviceExposesEnum
    | DeviceExposesText
    | DeviceExposesComposite


export interface DeviceExposesSwitch {
    type: "switch" | "light";
    features: DeviceExposesGeneric[];
}