import { Platform } from "../lib/connection";
import { ComponentType, PropertyClass, PropertyDataType } from "../lib/type";

// const configs = [config1, config2, config3, config4, configDevice,];
async function main() {
    const plat = new Platform("meteo-423D1", "martas", "Meteostanice");
    const node = plat.addNode("light", "Světlo", ComponentType.switch);
    node.addProperty({
        propertyId: "power",
        dataType: PropertyDataType.boolean,
        name: "Světlo",
        settable: true,
        callback: (prop) => {
            console.log("recieved light:", prop.value)
        }
    })

    const node2 = plat.addNode("meteo", "Meteo", ComponentType.sensor);

    node2.addProperty({
        name: "Teplota",
        propertyId: "temp",
        propertyClass: PropertyClass.Temperature,
        unitOfMeasurement: "°C",
        dataType: PropertyDataType.float,
    });
    node2.addProperty({
        propertyId: "hum",
        propertyClass: PropertyClass.Humidity,
        unitOfMeasurement: "%",
        name: "Vlhkost",
        dataType: PropertyDataType.float,
    });
    node2.addProperty({
        propertyId: "volt",
        propertyClass: PropertyClass.Voltage,
        unitOfMeasurement: "V",
        name: "Napětí",
        dataType: PropertyDataType.float,
    });
    node2.addProperty({
        propertyId: "press",
        propertyClass: PropertyClass.Pressure,
        unitOfMeasurement: "hPa",
        name: "Tlak",
        dataType: PropertyDataType.float,
    });

    node2.addProperty({
        propertyId: "temp2",
        propertyClass: PropertyClass.Temperature,
        unitOfMeasurement: "*C",
        name: "Teplota2",
        dataType: PropertyDataType.float,
    });

    const nodeLight = plat.addNode("gate", "Brána", ComponentType.activator);
    nodeLight.addProperty({
        propertyId: "power",
        dataType: PropertyDataType.enum,
        name: "Brána",
        settable: true,
        format: "on",
        callback: (prop) => {
            console.log("recieved gate:", prop.value)
        }
    })

    const nodeTry = plat.addNode("test", "Pokus", ComponentType.activator);
    nodeTry.addProperty({
        propertyId: "kill",
        dataType: PropertyDataType.enum,
        name: "Zabití",
        settable: true,
        format: "on,off,kill",
        callback: (prop) => {
            console.log("recieved try:", prop.value)
        }
    })

    // plat.publishData("volt", "11");
    plat.on("connect", (client) => {
        console.log("sending data");
        plat.publishSensorData("volt", "11");
        plat.publishSensorData("temp", "21.6");
        plat.publishSensorData("hum", "74");
        plat.publishSensorData("press", "112");
        plat.publishSensorData("temp2", "15.4");
        //plat.publishData("light", "power", "0");

        plat.publishSensorData("volt", "10.5");
        plat.publishSensorData("temp", "21.6");
        plat.publishSensorData("hum", "90");
        plat.publishSensorData("press", "100");
        plat.publishSensorData("temp2", "15.1");

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
