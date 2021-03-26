const si = require("systeminformation");
const Platform = require("../lib/connection");

const config1 = {
    component: "sensor",
    name: "Paměť", // musí být možné změnit na FE
    unitOfMeasurement: "%",
    propertyId: "memory",
};

// homeassistant/sensor/sensorBedroomT/config
const config2 = {
    component: "sensor",
    deviceClass: "pressure",
    name: "Zátěž", // musí být možné změnit na FE
    unitOfMeasurement: "%",
    propertyId: "load",
};

const config3 = {
    component: "sensor",
    deviceClass: "pressure",
    name: "Procesor", // musí být možné změnit na FE
    unitOfMeasurement: "GHz",
    propertyId: "cpu",
};

const configDevice = {
    component: "device",
    userName: "martas",
    name: "Workstation",
};

const configs = [config1, config2, config3, configDevice];
async function main() {
    // console.log("load", await si.cpu());
    const plat = new Platform("system-993D1", configs, "martas");

    // plat.publishData("volt", "11");
    plat.on("connect", async (client) => {
        console.log("sending data");
        const cpu = await si.cpu();
        const memory = await si.mem();
        const data6 = await si.currentLoad();
        console.log("mem", memory.active / memory.total);
        plat.publishSensorData(
            "memory",
            (memory.active / memory.total).toString().slice(0, 4)
        );
        plat.publishSensorData(
            "load",
            Math.floor(data6.cpus[0].load).toString()
        );
        plat.publishSensorData("cpu", cpu.speed.toString());
    });
    plat.init();
}

main();
