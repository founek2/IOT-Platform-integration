import { Platform } from "../lib/connection";
import { ComponentType, PropertyDataType, PropertyClass } from "../lib/type";
import { Socket } from "net";

const config = {
    spaIp: process.env.SPA_IP as string,
    spaPort: Number(process.env.SPA_PORT),
}

if (!config.spaIp)
    console.error("INVALID spa IP")

if (!config.spaPort)
    console.error("INVALID spa PORT")

if (!config.spaPort || !config.spaIp) process.exit(1);

const client = new Socket()

const Bubbles = {
    on: JSON.stringify({ "type": 1, "sid": "1616871584000", "data": "8888060F010400D4" }),
    off: JSON.stringify({ "type": 1, "sid": "1616871589000", "data": "8888060F010400D4" }),
}

const Nozzles = {
    on: JSON.stringify({ "type": 1, "sid": "1616871592000", "data": "8888060F011000C8" }),
    off: JSON.stringify({ "type": 1, "sid": "1616871596000", "data": "8888060F011000C8" }),
}

async function main() {
    const plat = new Platform("BOT-9011AC", "martas", "Spáčko");
    const nodeLight = plat.addNode("spa", "Vířivka", ComponentType.sensor);
    nodeLight.addProperty({
        propertyId: "temperature",
        dataType: PropertyDataType.float,
        name: "Teplota",
        propertyClass: PropertyClass.Temperature,
        unitOfMeasurement: "°C"
    })

    nodeLight.addProperty({
        propertyId: "power",
        dataType: PropertyDataType.boolean,
        name: "Zapnout",
        settable: true,
    })

    nodeLight.addProperty({
        propertyId: "bubbles",
        dataType: PropertyDataType.boolean,
        name: "Bubliny",
        settable: true,
        callback: function (prop) {
            if (prop.value === "true")
                sendData(Bubbles.on)
            else sendData(Bubbles.off)
        }
    })

    nodeLight.addProperty({
        propertyId: "nozzles",
        dataType: PropertyDataType.boolean,
        name: "Trysky",
        settable: true,
        callback: function (prop) {
            if (prop.value === "true")
                sendData(Nozzles.on)
            else sendData(Nozzles.off)
        }
    })

    nodeLight.addProperty({
        propertyId: "temptarget",
        dataType: PropertyDataType.float,
        name: "Teplota",
        format: "25:40",
        settable: true,
        unitOfMeasurement: "°C"
    })


    // plat.publishData("volt", "11");
    plat.on("connect", (client) => {
        console.log("sending data");
        // plat.publishSensorData("volt", "11");
        // plat.publishSensorData("temp", "21.1");
        // plat.publishSensorData("hum", "74");
        // plat.publishSensorData("power", "0");
        setInterval(function () {
            plat.publishData("spa", "temperature", "37.8")
        }, 10000)

        plat.publishData("spa", "temperature", "38")
    });
    plat.init();
}

main();


function sendData(message: string) {
    client.connect(config.spaPort, config.spaIp, function () {
        console.log('Connected');
        // client.write(message);
        console.log("message", message)
        client.destroy();
    });

    client.on('data', function (data) {
        console.log('Received: ' + data);
        client.destroy(); // kill client after server's response
    });

    client.on('close', function () {
        console.log('Connection closed');
    });
}