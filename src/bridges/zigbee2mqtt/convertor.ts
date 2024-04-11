import { PropertyDataType, Node, Logger } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import translateDeepl from "npm:translate";


function translate(text: string, deeplApiKey?: string): string | Promise<string> {
  if (!deeplApiKey) return text;

  if (text === "linkquality") return "Síla signálu";
  if (text === "state") return "stav";

  /** @ts-ignore */
  translateDeepl.engine = "deepl";
  /** @ts-ignore */
  translateDeepl.key = deeplApiKey;

  return translateDeepl(text.replace(/_/g, " "), {
    to: "cs",
    from: "en"
  });
}

export interface Device {
  definition: DeviceDefinition | null;
  ieee_address: string;
  friendly_name?: string;
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
  property: string;
  description: string;
}
export interface DeviceExposesEnum {
  type: "enum";
  access: number;
  name: string;
  property: string;
  description: string;
  values?: string[];
}

export interface DeviceExposesNumeric {
  type: "numeric";
  access: number;
  name: string;
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
  property: string;
  description: string;
  value_off: string;
  value_on: string;
}
export type DeviceExposesGeneric =
  | DeviceExposesBinary
  | DeviceExposesNumeric
  | DeviceExposesEnum
  | DeviceExposesText;

export interface DeviceExposesSwitch {
  type: "switch";
  features: DeviceExposesGeneric[];
}

const settableMask = 1 << 1;

export async function assignProperty(
  expose: DeviceExposesGeneric,
  thing: Node,
  publishBridge: (value: string) => void,
  deeplApiKey: string | undefined,
  log: Logger
) {
  const translatedName = await translate(expose.name, deeplApiKey);

  switch (expose.type) {
    case "enum":
      thing.addProperty({
        propertyId: expose.property,
        dataType: PropertyDataType.enum,
        name: translatedName,
        settable: Boolean(expose.access & settableMask),
        format: expose.values?.join(","),
        callback: (newValue) => {
          log.debug("recieved enum:", newValue);
          publishBridge(newValue!);

          // returns false, setting value will be handled once device confirms change
          return Promise.resolve(false);
        },
      });
      break;
    case "numeric":
      thing.addProperty({
        propertyId: expose.property,
        dataType: expose.property.includes("time") || expose.property.includes("duration")
          ? PropertyDataType.string
          : PropertyDataType.float,
        name: translatedName,
        settable: Boolean(expose.access & settableMask),
        unitOfMeasurement: expose.unit,
        callback: (newValue) => {
          log.debug("recieved float:", newValue);
          publishBridge(newValue!);

          return Promise.resolve(false);
        },
        format: expose.value_min !== undefined && expose.value_max !== undefined ? `${expose.value_min}:${expose.value_max}` : undefined
      });
      break;
    case "binary":
      thing.addProperty({
        propertyId: expose.property,
        dataType: PropertyDataType.boolean,
        name: translatedName,
        settable: Boolean(expose.access & settableMask),
        callback: (newValue) => {
          log.debug("recieved binary:", newValue);
          if (newValue === "true") publishBridge(expose.value_on);
          else publishBridge(expose.value_off);

          return Promise.resolve(false);
        },
      });
      break;
    case "text":
      thing.addProperty({
        propertyId: expose.property,
        dataType: PropertyDataType.string,
        name: translatedName,
        settable: Boolean(expose.access & settableMask),
        callback: (newValue) => {
          log.debug("recieved text:", newValue);
          publishBridge(newValue!);

          return Promise.resolve(false);
        },
      });
      break;
  }
}
