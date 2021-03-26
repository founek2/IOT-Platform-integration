import { Platform } from "../lib/connection";
import { ComponentType, IUser, PropertyDataType } from "../lib/type";

export class DevicesManager {
    count: number;
    objects: Array<Platform>;
    constructor(count: number) {
        this.count = count;
    }

    createAll = async (users: IUser[]) => {
        this.objects = [...new Array(this.count)]
            .map((_, i) => i)
            .map((i) => {
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

                plat.addNode("light", "Světloa", ComponentType.switch);

                plat.on("connect", (client) => {
                    console.log("sending data");
                    plat.publishSensorData("temperature", "11");
                    plat.publishSensorData("humidity", "21.6");
                    plat.publishData("light", "power", "off");

                    setInterval(() => {
                        plat.publishSensorData("temperature", "11");
                    }, (Math.random() * 4 + 2) * 1000);

                    setInterval(() => {
                        plat.publishSensorData("humidity", "21.6");
                    }, (Math.random() * 4 + 2) * 1000);
                    setInterval(() => {
                        plat.publishData(
                            "light",
                            "power",
                            Math.random() > 0.5 ? "on" : "off"
                        );
                    }, (Math.random() * 4 + 2) * 1000);

                    plat.on("/light/power/set", (value) => {
                        console.log("recieved power", value);
                        plat.publishData("light", "power", value);
                    });
                });
                plat.init();

                return plat;
            });
    };

    deleteAll = async () => {
        return Promise.all(
            this.objects.map(
                (obj) =>
                    new Promise((res, rej) => {
                        obj.client.end(false, {}, res);
                    })
            )
        );
    };
}

function getNext<T>(arr: Array<T>, i: number): T {
    if (!i) return arr[0];
    return arr[i % arr.length];
}
