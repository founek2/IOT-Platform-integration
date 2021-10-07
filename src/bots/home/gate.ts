import { Platform } from "../../lib/connection";
import { ComponentType, PropertyDataType } from "../../lib/type";

async function main() {
    const plat = new Platform("ESP-4B35CC", "martas", "Brána");
    const nodeLight = plat.addNode("gate", "Brána", ComponentType.activator);
    nodeLight.addProperty({
        propertyId: "power",
        dataType: PropertyDataType.enum,
        name: "Zapnutí",
        settable: true,
        format: "on",
    });

    // plat.publishData("volt", "11");
    plat.on("connect", (client) => {
        console.log("sending data");
    });
    plat.init();
}

main();
