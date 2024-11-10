import { PropertyDataType, PropertyArgs } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { DeviceExposesSwitch } from "./zigbeeTypes.ts";
import { DeviceExposesGeneric } from "./zigbeeTypes.ts";
import { Device } from "./zigbeeTypes.ts";
import xyz from "npm:color-space/xyz.js"
import xyy from "npm:color-space/xyy.js"

export type TransformedExpose = PropertyArgs & { translateForZigbee?: (value: any) => any, translateForPlatform?: (value: any) => any }
export type TransformedExposes =
  TransformedExpose | { type: string, features: TransformedExpose[] }

export interface DeviceTransformed {
  definition: DeviceDefinitionTransformed | null;
  ieee_address: string;
  friendly_name: string;  // z2m defaults to ieee_address
}
export interface DeviceDefinitionTransformed {
  // contains device full name
  description: string;
  model: string;
  vendor: string;
  exposes: TransformedExposes[];
}


type PropertyOverride = {
  name?: string,
  format?: string,
  type?: PropertyDataType,
}
type DeviceOverride = {
  name?: string,
  properties?: Record<string, PropertyOverride | undefined> | undefined
}
type Override = Record<string, DeviceOverride | undefined>
export function transformAndOverrideDevice(devices: Device[], overrides: Override = {}): DeviceTransformed[] {
  return devices.map(device => {
    const override = overrides[device.friendly_name]
    if (override?.name) device.friendly_name = override.name;

    const dev: DeviceTransformed = {
      ...device,
      definition: (device.definition ? {
        ...device.definition,
        exposes: device.definition?.exposes.map(transformAndOverrideProperty(override?.properties)) || []
      } : null)
    }
    return dev
  })
}

function transformAndOverrideProperty(override: DeviceOverride['properties'] = {}) {
  function applySingle(expose: DeviceExposesGeneric): TransformedExposes {
    const propOverride = override[expose.property]

    const transformed = transformProperty(expose)
    if (propOverride?.type) {
      transformed.dataType = propOverride.type
      if (transformed.dataType === PropertyDataType.color) {
        transformed.translateForZigbee = (value: string) => {
          return JSON.stringify({ rgb: value })
        }
        transformed.translateForPlatform = (color: { x: number, y: number }) => {
          const rgb = xyz.rgb(xyy.xyz([color.x, color.y, 100])).map((v: number) => Math.round(v))
          return `${rgb[0]},${rgb[1]},${rgb[2]}`;
        }
      }
    }

    if (propOverride?.name) transformed.name = propOverride.name
    if (propOverride?.format) transformed.format = propOverride.format
    return transformed
  }

  function apply(expose: DeviceExposesGeneric | DeviceExposesSwitch): TransformedExposes {
    if ('features' in expose && expose.type != "composite") {
      const property: TransformedExposes = {
        type: expose.type,
        features: expose.features.map(applySingle) as PropertyArgs[]
      }

      return property
    }

    return applySingle(expose);
  }

  return apply
}

const settableMask = 1 << 1;

export function transformProperty(
  expose: DeviceExposesGeneric,
): TransformedExpose {
  const name = expose.label || expose.name.replace(/_/g, " ")
  switch (expose.type) {
    case "enum":
      return {
        propertyId: expose.property,
        dataType: PropertyDataType.enum,
        name,
        settable: Boolean(expose.access & settableMask),
        format: expose.values?.join(","),
      }
    case "numeric":
      return {
        propertyId: expose.property,
        dataType: expose.property.includes("time") || expose.property.includes("duration")
          ? PropertyDataType.string
          : PropertyDataType.float,
        name,
        settable: Boolean(expose.access & settableMask),
        unitOfMeasurement: expose.unit,
        format: expose.value_min !== undefined && expose.value_max !== undefined ? `${expose.value_min}:${expose.value_max}` : undefined
      };
    case "binary":
      return {
        propertyId: expose.property,
        dataType: PropertyDataType.boolean,
        name,
        settable: Boolean(expose.access & settableMask),
        translateForZigbee: (newValue: string) => {
          if (newValue === "true") return expose.value_on;
          else return expose.value_off;
        },
        translateForPlatform: (newValue: string) => {
          if (expose.value_on === newValue) return "true";
          else return "false"
        },
      };
    case "text":
      return {
        propertyId: expose.property,
        dataType: PropertyDataType.string,
        name,
        settable: Boolean(expose.access & settableMask),
      };
    case "composite":
      return {
        propertyId: expose.property,
        dataType: PropertyDataType.string,
        name,
        settable: Boolean(expose.access & settableMask),
      };
  }
}
