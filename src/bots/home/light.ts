import { Platform } from "../../lib/connection";
import { ComponentType, PropertyDataType } from "../../lib/type";

async function main() {
    const plat = new Platform("ESP-5A4889", "martas", "Lustr");
    const nodeLight = plat.addNode(
        "relay",
        "LustrPostel",
        ComponentType.switch
    );
    nodeLight.addProperty({
        propertyId: "power",
        dataType: PropertyDataType.boolean,
        name: "Lustr",
        settable: true,
    });

    nodeLight.addProperty({
        propertyId: "toggle",
        dataType: PropertyDataType.enum,
        name: "Toggle",
        format: "on",
        settable: true,
    });

    // plat.publishData("volt", "11");
    plat.on("connect", (client) => {
        console.log("sending data");
    });
    plat.init();
}

main();
