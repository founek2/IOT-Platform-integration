import { Platform } from "../../lib/connection";
import { ComponentType, PropertyDataType, PropertyClass } from "../../lib/type";

async function main() {
    const plat = new Platform("ESP-5A4889", "martas", "Stůl");
    const nodeLight = plat.addNode("relay", "Led stůl", ComponentType.switch);
    nodeLight.addProperty({
        propertyId: "power",
        dataType: PropertyDataType.boolean,
        name: "Led stůl",
        settable: true,
    });

    nodeLight.addProperty({
        propertyId: "left",
        dataType: PropertyDataType.boolean,
        name: "Levé",
        settable: true,
    });

    nodeLight.addProperty({
        propertyId: "right",
        dataType: PropertyDataType.boolean,
        name: "Pravé",
        settable: true,
    });

    const sensorNode = plat.addNode("sensor0", "Teplota", ComponentType.sensor);
    sensorNode.addProperty({
        propertyId: "temperature",
        dataType: PropertyDataType.float,
        propertyClass: PropertyClass.Temperature,
        name: "Teplota",
        unitOfMeasurement: "°C",
    });

    const recieverNode = plat.addNode(
        "reciever",
        "Reciever",
        ComponentType.switch
    );
    recieverNode.addProperty({
        propertyId: "power",
        name: "Zapnutí",
        dataType: PropertyDataType.boolean,
        settable: true,
    });
    recieverNode.addProperty({
        propertyId: "volume",
        name: "Hlasitost",
        dataType: PropertyDataType.integer,
        format: "0:80",
        settable: true,
    });
    recieverNode.addProperty({
        propertyId: "input",
        name: "Vstup",
        dataType: PropertyDataType.enum,
        format: "net_radio,bluetooth,airplay,tuner,spotify",
        settable: true,
    });

    // plat.publishData("volt", "11");
    plat.on("connect", (client) => {
        console.log("sending data");
    });
    plat.init();
}

main();
