// source https://github.com/Koenkk/zigbee2mqtt/blob/master/lib/types/api.ts

export type Feature = Numeric | Binary | Enum | Composite | List | Text;

export interface Base {
    name: string;
    label: string;
    access: number;
    type: "lock" | "binary" | "list" | "numeric" | "enum" | "text" | "composite";
    endpoint?: string;
    property: string;
    description?: string;
    // features?: Feature[];
    category?: "config" | "diagnostic";
}

export interface Text extends Base {
    type: "text";
    property: string;
}

export interface Enum extends Base {
    type: "enum"
    property: string;
    values: (string | number)[];
}

export interface Numeric extends Base {
    type: "numeric"
    property: string;
    unit?: string;
    value_max?: number;
    value_min?: number;
    value_step?: number;
    presets?: {
        name: string;
        value: number | string;
        description: string;
    }[];
}

export interface Binary extends Base {
    type: "binary"
    property: string;
    value_on: string | boolean;
    value_off: string | boolean;
    value_toggle?: string;
}

export interface List extends Base {
    type: "list"
    property: string;
    item_type: Numeric | Binary | Composite | Text;
    length_min?: number;
    length_max?: number;
}

export interface Composite extends Base {
    type: "composite"
    property: string;
    features: Feature[];
}

export type BaseExtended = Omit<Base, "type"> & {
    type: "light" | "cover" | "fan" | "climate" | "switch";
    features?: Feature[];
}

export type Option = | Binary
    | Numeric
    | Enum
    | Text
    | Composite
    | List;

export type Generic =
    | Binary
    | Numeric
    | Enum
    | Text
    | Composite
    | List
    | BaseExtended