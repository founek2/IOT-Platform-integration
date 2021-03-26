import fetch, { Response } from "node-fetch";
import { IUser, IDiscovery, IDevice } from "../lib/type";

const a = <T>(arr: Array<Promise<T>>): Promise<T[]> => Promise.all(arr);
type UserWithToken = { user: IUser; token: string };
export class UsersManager {
    count: number;
    objects: UserWithToken[];
    devices: IDevice[][];
    constructor(count: number) {
        this.count = count;
    }

    createAll = async () => {
        const responses = await a(
            [...new Array(this.count)]
                .map((_, i) => i)
                .map((i) => ({
                    info: {
                        userName: "user" + i,
                        firstName: "jmeno" + i,
                        lastName: "prijmeni" + i,
                        email: "kekel" + i + "@iotplatforma.cloud",
                    },
                    auth: {
                        password: "123456",
                    },
                }))
                .map(createUser)
        );
        checkOk(responses, "createUsers");

        this.objects = await a(responses.map((res) => res.json()));
    };

    deleteAll = async () => {
        const responses = await a(this.objects.map(deleteItself));

        checkOk(responses, "deleteUsers");
    };

    pairAllDevices = async () => {
        const responses = await a(this.objects.map(getDicovery));
        checkOk(responses, "discoveredDevices");

        const discovered: { docs: IDiscovery[] }[] = await a(
            responses.map((res) => res.json())
        );

        const pairedResponses = await a(
            discovered.map((json, i) =>
                a(
                    json.docs.map((device) =>
                        pairDiscovered(device, this.objects[i])
                    )
                )
            )
        );

        checkOk(pairedResponses.flat(), "pairAllDiscovered");

        const devicesBody = await a(
            pairedResponses.map((arr) => a(arr.map((res) => res.json())))
        );

        this.devices = devicesBody.map((arr) => arr.map((json) => json.doc));
    };

    deleteAllDevices = async () => {
        const responses = await a(
            this.devices.map((devices, i) =>
                a(
                    devices.map((device) =>
                        deleteDevice(device, this.objects[i])
                    )
                )
            )
        );
        checkOk(responses.flat(), "deleteAllDevices");
    };
}

function createUser(formData) {
    return fetch("http://localhost:8085/api/user", {
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ formData: { REGISTRATION: formData } }),
    });
}

function deleteItself({ user, token }: UserWithToken) {
    return fetch("http://localhost:8085/api/user/" + user._id, {
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Authorization-JWT": token,
        },
        method: "DELETE",
    });
}

function checkOk(res: Response[], message: string) {
    if (res.every((res) => res.status === 200 || res.status === 204))
        console.log("all done", message, res.length);
    else
        console.error(
            "error",
            message,
            res.map((r) => r.status)
        );
}

function getDicovery({ user, token }: UserWithToken) {
    return fetch("http://localhost:8085/api/discovery", {
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Authorization-JWT": token,
        },
        method: "GET",
    });
}

function pairDiscovered(device: IDiscovery, { user, token }: UserWithToken) {
    return fetch("http://localhost:8085/api/discovery", {
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Authorization-JWT": token,
        },
        method: "POST",
        body: JSON.stringify({
            formData: {
                CREATE_DEVICE: {
                    _id: device._id,
                    info: {
                        name: device.name,
                        location: {
                            building: "doma",
                            room: "pokoj",
                        },
                    },
                },
            },
        }),
    });
}

function deleteDevice(device: IDevice, { user, token }: UserWithToken) {
    return fetch("http://localhost:8085/api/device/" + device._id, {
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Authorization-JWT": token,
        },
        method: "DELETE",
    });
}
