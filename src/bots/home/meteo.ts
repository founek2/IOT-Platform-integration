import { Platform } from "../../lib/connection";
import { ComponentType, PropertyClass, PropertyDataType } from "../../lib/type";

// const configs = [config1, config2, config3, config4, configDevice,];
async function main() {
    const plat = new Platform("ESP-4B35CC", "martas", "Meteostanice");
    const node = plat.addNode("meteo", "Meteo", ComponentType.sensor);
    node.addProperty({
        propertyId: "temp",
        dataType: PropertyDataType.float,
        propertyClass: PropertyClass.Temperature,
        name: "Teplota",
        unitOfMeasurement: "°C",
    });

    node.addProperty({
        propertyId: "humidity",
        propertyClass: PropertyClass.Humidity,
        unitOfMeasurement: "%",
        name: "Vlhkost",
        dataType: PropertyDataType.float,
    });

    node.addProperty({
        propertyId: "voltage",
        propertyClass: PropertyClass.Voltage,
        unitOfMeasurement: "V",
        name: "Napětí",
        dataType: PropertyDataType.float,
    });
    node.addProperty({
        propertyId: "pressure",
        propertyClass: PropertyClass.Pressure,
        unitOfMeasurement: "hPa",
        name: "Tlak",
        dataType: PropertyDataType.float,
    });

    node.addProperty({
        propertyId: "temp2",
        propertyClass: PropertyClass.Temperature,
        unitOfMeasurement: "°C",
        name: "Teplota2",
        dataType: PropertyDataType.float,
    });

    plat.on("connect", (client) => {
        // console.log("sending data");
    });
    plat.init();
}

main();

/**
 * config topic - prefix/componentType/deviceId/config
 * payload = {
 *        "device_class": ["temperature"|"humidity"|"pressure"|"voltage"],
 *        "name": "deviceName", - Optional ex. "gatePower"
 *        "state_topic": "prefix/componentType/deviceName/state",
 *        "command_topic": "prefix/componentType/deviceName/set",
 *        "unit_of_measurement": "°C",
 *        "component_id": "key"
 * }
 *
 * componentType = switch|sensor|binary_sensor
 */
