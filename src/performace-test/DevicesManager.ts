import { Platform } from "../lib/connection";
import { ComponentType, IUser, PropertyDataType } from "../lib/type";
import asyncPool from "tiny-async-pool";
import { sleep } from "../lib/utils";

export class DevicesManager {
    count: number;
    objects: Array<Platform>;
    constructor(count: number) {
        this.count = count;
    }

    createAll = async (users: IUser[]) => {
        console.log("Setting up", this.count, "devices")

        this.objects = await asyncPool(
            7,
            [...new Array(this.count)].map((_, i) => i),
            async (i) => {
                const plat = new Platform(
                    "VIRT-" + i,
                    getNext(users, i).info.userName,
                    "Zařízení a" + i
                );
                plat.addSensor({
                    name: "Teplota",
                    dataType: PropertyDataType.float,
                    propertyId: "temperature",
                    unitOfMeasurement: "C",
                });

                plat.addSensor({
                    name: "Vlhkost",
                    dataType: PropertyDataType.integer,
                    propertyId: "humidity",
                    unitOfMeasurement: "%",
                });

                plat.addNode("light", "Světlo", ComponentType.switch).addProperty({
                    propertyId: "power",
                    dataType: PropertyDataType.boolean,
                    name: "Zapnutí"
                })

                plat.on("connect", (client) => {
                    plat.publishSensorData("temperature", "11");
                    plat.publishSensorData("humidity", "21.6");
                    plat.publishData("light", "power", "off");

                    setInterval(() => {
                        if (plat.client.connected)
                            plat.publishSensorData("temperature", "11");
                    }, (Math.random() * 10 + 2) * 1000);

                    setInterval(() => {
                        if (plat.client.connected)
                            plat.publishSensorData("humidity", "21.6");
                    }, (Math.random() * 10 + 2) * 1000);
                    setInterval(() => {
                        if (plat.client.connected)
                            plat.publishData(
                                "light",
                                "power",
                                Math.random() > 0.5 ? "on" : "off"
                            );
                    }, (Math.random() * 10 + 2) * 1000);

                    plat.on("/light/power/set", (value) => {
                        console.log("recieved power", value);
                        plat.publishData("light", "power", value);
                    });
                });
                await plat.init();
                await sleep(1, true);
                return plat;
            });
    };

    deleteAll = async () => {
        return asyncPool(
            10,
            this.objects,
            (obj) =>
                new Promise((res, rej) => {
                    obj.client.end(false, {}, res);
                })

        );
    };
}

function getNext<T>(arr: Array<T>, i: number): T {
    if (!i) return arr[0];
    return arr[i % arr.length];
}
