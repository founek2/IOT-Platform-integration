import { ComponentType, PropertyClass, PropertyDataType } from "iot-platform/deno";
import { AttributeModel, CommandModel, EventModel, Matter, Metatype, type ValueModel } from "@matter/model";
import { toBigIntAwareJson, type MatterNode } from "@matter-server/ws-client";

export interface MatterProperty {
    path: string;
    endpoint: number;
    id: string;
    name: string;
    type: PropertyDataType;
    unit?: string;
    propertyClass?: PropertyClass;
    scale?: number;
    format?: string;
    enumValues?: Record<string, number>;
    conversion?: "illuminance" | "occupancy";
    wideInteger?: boolean;
    timed?: boolean;
    atomic?: boolean;
    jsonKind?: "array" | "object" | "bitmap";
    command?: "onoff" | "level" | "write" | "invoke";
    commandName?: string;
    cluster?: number;
}

const clusters = new Map(Matter.clusters.filter((cluster) => cluster.id !== undefined).map((cluster) => [cluster.id, cluster]));

function humanName(name: string) {
    return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}

function propertyName(clusterName: string, modelName: string) {
    const name = humanName(clusterName);
    const matches = humanName(modelName).match(/\b(?:min(?:imum)?|max(?:imum)?|uncertainty)\b/gi);
    if (!matches) return name;
    const suffixes = [...new Set(matches.map((match) => {
        const lower = match.toLowerCase();
        if (lower.startsWith("min")) return "min";
        if (lower.startsWith("max")) return "max";
        return "Uncertainty";
    }))];
    return `${name} - ${suffixes.join("/")}`;
}

function enumValues(model: ValueModel): Record<string, number> | undefined {
    const values: Record<string, number> = {};
    for (const member of model.definingModel?.children || []) {
        if (typeof member.id === "number") values[member.name] = member.id;
    }
    if (Object.keys(values).length) return values;
}

function containsSecret(model: ValueModel, visited = new Set<ValueModel>()): boolean {
    if (visited.has(model)) return false;
    visited.add(model);
    if (model.effectiveIsSecret || model.effectiveAccess.fabricSensitive || model.effectiveAccess.fabricScoped) return true;
    return model.members.some((member) => containsSecret(member, visited));
}

function supports(attributes: Record<string, unknown>, endpoint: number, cluster: number, commands: number[]) {
    const accepted = attributes[`${endpoint}/${cluster}/65529`];
    return Array.isArray(accepted) && commands.every((command) => accepted.includes(command));
}

function unitName(name: string): string {
    const display: Record<string, string> = {
        Ppm: "ppm", Ppb: "ppb", Ppt: "ppt", Mgm3: "mg/m³", Ugm3: "µg/m³",
        Ngm3: "ng/m³", Pm3: "particles/m³", Bqm3: "Bq/m³",
    };
    return display[name] || name;
}

function applyUnits(property: MatterProperty, model: AttributeModel, clusterName: string, attributes: Record<string, unknown>) {
    if (model.effectiveType === "temperature") {
        property.scale = 0.01;
        property.type = PropertyDataType.float;
        property.unit = "°C";
        property.propertyClass = PropertyClass.Temperature;
    } else if (model.effectiveType === "percent100ths") {
        property.scale = 0.01;
        property.type = PropertyDataType.float;
        property.unit = "%";
    } else if (model.effectiveType === "percent") {
        property.unit = "%";
    }
    // Some clusters encode measurement units in their specification rather than the attribute type.
    if (clusterName === "RelativeHumidityMeasurement" && model.id <= 2) {
        property.scale = 0.01;
        property.type = PropertyDataType.float;
        property.unit = "%";
        property.propertyClass = PropertyClass.Humidity;
    } else if (clusterName === "IlluminanceMeasurement" && model.id <= 2) {
        property.conversion = "illuminance";
        property.type = PropertyDataType.float;
        property.unit = "lx";
    } else if (clusterName === "PressureMeasurement" && model.id <= 2) {
        property.unit = "hPa";
        property.propertyClass = PropertyClass.Pressure;
    } else if (clusterName === "PowerSource" && model.name === "BatPercentRemaining") {
        property.scale = 0.5;
        property.type = PropertyDataType.float;
        property.unit = "%";
    }
    const cluster = clusters.get(property.cluster!);
    if (cluster?.base?.name === "ConcentrationMeasurement" && [0, 1, 2, 3, 5, 7].includes(model.id)) {
        const unit = attributes[`${property.endpoint}/${property.cluster}/8`];
        const unitModel = cluster.attributes(8);
        if (unitModel && typeof unit === "number") {
            const names = enumValues(unitModel);
            const name = names && Object.keys(names).find((key) => names[key] === unit);
            if (name) property.unit = unitName(name);
        }
    }
}

export function mapProperties(node: MatterNode, schemaVersion = 15): MatterProperty[] {
    const result: MatterProperty[] = [];
    for (const path of Object.keys(node.attributes)) {
        const match = /^(\d+)\/(\d+)\/(\d+)$/.exec(path);
        if (!match) continue;
        const endpoint = Number(match[1]);
        const clusterId = Number(match[2]);
        const attributeId = Number(match[3]);
        const cluster = clusters.get(clusterId);
        if (!cluster || (cluster.effectiveClassification !== "application" && cluster.name !== "PowerSource")) continue;
        const model = cluster.attributes(attributeId);
        if (!(model instanceof AttributeModel) || attributeId >= 65528 || !model.readable ||
            model.fabricScoped || containsSecret(model)) continue;

        let type: PropertyDataType;
        const values = enumValues(model);
        switch (model.effectiveMetatype) {
            case Metatype.boolean: type = PropertyDataType.boolean; break;
            case Metatype.integer:
                type = (model.primitiveBase?.byteSize || 0) > 6 ? PropertyDataType.string : PropertyDataType.integer;
                break;
            case Metatype.float: type = PropertyDataType.float; break;
            case Metatype.enum: type = values ? PropertyDataType.enum : PropertyDataType.integer; break;
            case Metatype.string: type = PropertyDataType.string; break;
            case Metatype.bitmap:
            case Metatype.array:
            case Metatype.object: type = PropertyDataType.string; break;
            default: continue;
        }
        const property: MatterProperty = {
            path, endpoint, cluster: clusterId, id: `e${endpoint}-c${clusterId}-a${attributeId}`,
            name: propertyName(cluster.name, model.name), type,
        };
        if (model.effectiveMetatype === Metatype.integer && type === PropertyDataType.string) property.wideInteger = true;
        if (model.effectiveMetatype === Metatype.array || model.effectiveMetatype === Metatype.object ||
            model.effectiveMetatype === Metatype.bitmap) property.jsonKind = model.effectiveMetatype;
        if (type === PropertyDataType.enum && values) {
            property.enumValues = values;
            property.format = Object.keys(values).join(",");
        }
        applyUnits(property, model, cluster.name, node.attributes);
        if (model.writable && (!model.effectiveQuality.atomic || schemaVersion >= 15)) {
            property.command = "write";
            if (model.effectiveAccess.timed) property.timed = true;
            if (model.effectiveQuality.atomic) property.atomic = true;
        }
        if (clusterId === 6 && attributeId === 0 && supports(node.attributes, endpoint, clusterId, [0, 1])) {
            property.command = "onoff";
        } else if (clusterId === 8 && attributeId === 0 && supports(node.attributes, endpoint, clusterId, [0])) {
            property.command = "level";
            property.format = "0:254";
        } else if (clusterId === 1030 && attributeId === 0) {
            property.type = PropertyDataType.boolean;
            property.conversion = "occupancy";
        }
        result.push(property);
    }

    for (const [path, accepted] of Object.entries(node.attributes)) {
        const match = /^(\d+)\/(\d+)\/65529$/.exec(path);
        if (!match || !Array.isArray(accepted)) continue;
        const endpoint = Number(match[1]);
        const clusterId = Number(match[2]);
        const cluster = clusters.get(clusterId);
        if (!cluster || cluster.effectiveClassification !== "application") continue;
        if (clusterId === 6 && result.some((property) => property.endpoint === endpoint && property.command === "onoff")) continue;
        for (const model of cluster.allAces) {
            if (!(model instanceof CommandModel) || model.direction !== "request" ||
                !accepted.includes(model.id) || containsSecret(model)) continue;
            result.push({
                path: `${endpoint}/${clusterId}/command/${model.id}`, endpoint, cluster: clusterId,
                id: `e${endpoint}-c${clusterId}-cmd${model.id}`,
                name: propertyName(cluster.name, model.name),
                type: PropertyDataType.string, command: "invoke", commandName: model.propertyName,
                timed: model.effectiveAccess.timed || undefined,
            });
        }
    }
    return result.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

export function mapEvent(endpoint: number, clusterId: number, eventId: number): MatterProperty | undefined {
    const cluster = clusters.get(clusterId);
    if (!cluster || cluster.effectiveClassification !== "application") return undefined;
    const model = cluster.events(eventId);
    if (!(model instanceof EventModel) || containsSecret(model)) return undefined;
    return {
        path: `${endpoint}/${clusterId}/event/${eventId}`, endpoint, cluster: clusterId,
        id: `e${endpoint}-c${clusterId}-event${eventId}`,
        name: propertyName(cluster.name, model.name), type: PropertyDataType.string,
    };
}

export function propertyValue(property: MatterProperty, value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (property.conversion === "occupancy") {
        if (typeof value === "number") return String((value & 1) !== 0);
        if (typeof value === "object" && "0" in value && typeof value["0"] === "boolean") return String(value["0"]);
        if (typeof value === "object" && "occupied" in value && typeof value.occupied === "boolean") return String(value.occupied);
        return undefined;
    }
    if (property.conversion === "illuminance" && typeof value === "number") {
        if (value === 0) return "0";
        if (value === 65535) return undefined;
        return String(Math.pow(10, (value - 1) / 10000));
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        if (property.enumValues) {
            const name = Object.keys(property.enumValues).find((key) => property.enumValues![key] === value);
            if (name) return name;
        }
        return String(property.scale === undefined ? value : value * property.scale);
    }
    if (typeof value === "boolean" || typeof value === "bigint" || typeof value === "string") return String(value);
    if (typeof value === "object") return toBigIntAwareJson(value);
    return undefined;
}

export function endpointType(properties: MatterProperty[]): ComponentType {
    if (properties.some((property) => property.command === "onoff")) return ComponentType.switch;
    if (properties.some((property) => property.command !== "invoke")) return ComponentType.sensor;
    return ComponentType.generic;
}
