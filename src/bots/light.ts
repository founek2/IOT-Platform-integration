import { Platform } from "../lib/connection";
import { ComponentType, PropertyDataType } from "../lib/type";

async function main() {
    const plat = new Platform("light-411D1", "martas", "Světlomat");
    plat.addNode("light", "Světlo", ComponentType.switch);
    const node = plat.addNode("center", "Centrum", ComponentType.generic);
    node.addProperty({
        name: "Displej",
        propertyId: "currency",
        dataType: PropertyDataType.enum,
        format: "BTC,EUR,CZK,ETH",
        settable: true,
    });

    node.addProperty({
        name: "Aktuální kurz",
        propertyId: "rate",
        dataType: PropertyDataType.float,
        unitOfMeasurement: "$",
    });

    node.addProperty({
        name: "Poměr",
        propertyId: "percentage",
        dataType: PropertyDataType.integer,
        unitOfMeasurement: "%",
        format: "0:100",
        settable: true,
    });

    node.addProperty({
        name: "Číslo",
        propertyId: "numbers",
        dataType: PropertyDataType.integer,
        settable: true,
    });

    node.addProperty({
        name: "Text",
        propertyId: "strings",
        dataType: PropertyDataType.string,
        settable: true,
    });

    function sendRate() {
        plat.publishData(
            "center",
            "rate",
            (Math.random() * 10).toFixed(2).toString()
        );
    }

    // plat.publishData("volt", "11");
    plat.on("connect", (client) => {
        console.log("sending data");
        // plat.publishSensorData("volt", "11");
        // plat.publishSensorData("temp", "21.1");
        // plat.publishSensorData("hum", "74");
        // plat.publishSensorData("power", "0");

        plat.publishData("light", "power", "on");

        sendRate();
        setInterval(sendRate, 10000);
        plat.publishData("center", "currency", "ETH");

        plat.on("v2/martas/light-411D1/light/power/set", (value) => {
            console.log("recieved power", value);
            client.publish("v2/martas/light-411D1/light/power", value);
        });

        plat.on("v2/martas/light-411D1/center/currency/set", (value) => {
            console.log("recieved currency", value);
            client.publish("v2/martas/light-411D1/center/currency", value);
        });
    });
    plat.init();
}

main();
