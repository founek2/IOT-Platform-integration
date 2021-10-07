import { Platform } from "../../lib/connection";
import { ComponentType, PropertyDataType } from "../../lib/type";

async function main() {
    const plat = new Platform("ESP-4B07A5", "Milos", "Postel");
    const nodeLight = plat.addNode("relay", "Postel", ComponentType.switch);
    nodeLight.addProperty({
        propertyId: "power",
        dataType: PropertyDataType.boolean,
        name: "Postel led",
        settable: true,
    });

    // plat.publishData("volt", "11");
    plat.on("connect", (client) => {
        console.log("sending data");
    });
    plat.init();
}

main();
