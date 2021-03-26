import { Platform } from "../lib/connection";
import { ComponentType, PropertyClass, PropertyDataType } from "../lib/type";

// const configs = [config1, config2, config3, config4, configDevice,];
async function main() {
    const plat = new Platform("meteo-423D1", "martas", "Meteostanice");
    plat.addNode("light", "Světlo", ComponentType.switch);
    plat.addSensor({
        name: "Teplota",
        propertyId: "temp",
        propertyClass: PropertyClass.Temperature,
        unitOfMeasurement: "°C",
        dataType: PropertyDataType.float,
    });
    plat.addSensor({
        propertyId: "hum",
        propertyClass: PropertyClass.Humidity,
        unitOfMeasurement: "%",
        name: "Vlhkost",
        dataType: PropertyDataType.float,
    });
    plat.addSensor({
        propertyId: "volt",
        propertyClass: PropertyClass.Voltage,
        unitOfMeasurement: "V",
        name: "Napětí",
        dataType: PropertyDataType.float,
    });
    plat.addSensor({
        propertyId: "press",
        propertyClass: PropertyClass.Pressure,
        unitOfMeasurement: "hPa",
        name: "Tlak",
        dataType: PropertyDataType.float,
    });
    // plat.publishData("volt", "11");
    plat.on("connect", (client) => {
        console.log("sending data");
        plat.publishSensorData("volt", "11");
        plat.publishSensorData("temp", "21.6");
        plat.publishSensorData("hum", "74");
        plat.publishSensorData("press", "112");
        //plat.publishData("light", "power", "0");

        plat.publishSensorData("volt", "10.5");
        plat.publishSensorData("temp", "21.6");
        plat.publishSensorData("hum", "90");
        plat.publishSensorData("press", "100");

        plat.on("v2/martas/meteo-423D1/light/power/set", (value) => {
            console.log("recieved power", value);
            client.publish("v2/martas/meteo-423D1/light/power", value);

            plat.on("v2/martas/meteo-423D1/light/power/set", (value) => {
                console.log("recieved power", value);
                client.publish("v2/martas/meteo-423D1/light/power", value);
            });
        });
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
