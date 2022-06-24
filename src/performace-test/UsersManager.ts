import fetch, { Response } from 'node-fetch';
import { IUser, IDiscovery, IDevice } from '../lib/type';
import asyncPool from 'tiny-async-pool';
import config from '../config';
import { sleep } from '../lib/utils';

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
        const responses = await asyncPool(
            3,
            [...new Array(this.count)]
                .map((_, i) => i)
                .map((i) => ({
                    info: {
                        userName: 'user' + i,
                        firstName: 'jmeno' + i,
                        lastName: 'prijmeni' + i,
                        email: 'kekel' + i + '@iotplatforma.cloud',
                    },
                    auth: {
                        password: '123456',
                    },
                })),
            createUser
        );
        checkOk(responses, 'createUsers');

        this.objects = await a(responses.map((res) => res.json()));
    };

    deleteAll = async () => {
        const responses = await asyncPool(10, this.objects, deleteItself);

        checkOk(responses, 'deleteUsers');
    };

    pairAllDevices = async (count: number) => {
        let discovered: { docs: IDiscovery[] }[] = [];

        let foundAll = false;
        let counter = 0;
        while (!foundAll) {
            const responses = await asyncPool(10, this.objects, getDicovery);

            let cnt = 0;
            if (responses.every((res) => res.status === 200 || res.status === 204)) {
                checkOk(responses, 'discoveredDevices for users');

                discovered = await a(responses.map((res) => res.json()));

                cnt = discovered.reduce((acc, current) => acc + current.docs.length, 0);
                foundAll = cnt >= count;
            }

            if (!foundAll) {
                console.log('discovered only', cnt, 'of', count);
                counter += 1;
                if (counter > 7) throw new Error('Unable to discover all devices');
                await sleep(this.count % 20);
            }
        }

        const pairedResponses = await a(
            discovered.map((json, i) => a(json.docs.map((device) => pairDiscovered(device, this.objects[i]))))
        );

        checkOk(pairedResponses.flat(), 'pairAllDiscovered');

        const devicesBody = await a(pairedResponses.map((arr) => a(arr.map((res) => res.json()))));

        this.devices = devicesBody.map((arr) => arr.map((json) => json.doc));
    };

    deleteAllDevices = async () => {
        const responses = await a(
            this.devices.map((devices, i) => asyncPool(10, devices, (device) => deleteDevice(device, this.objects[i])))
        );
        checkOk(responses.flat(), 'deleteAllDevices');
    };
}

function createUser(formData: any): Promise<Response> {
    return new Promise(async (resolve, rej) => {
        const response = await fetch(`${config.HTTP_SERVER_URL}/api/user`, {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            method: 'POST',
            body: JSON.stringify({ formData: { REGISTRATION: formData } }),
        });

        setTimeout(() => resolve(response), 1000); // wait, because of rate limmiter on this endpoint
    });
}

function deleteItself({ user, token }: UserWithToken) {
    return fetch(`${config.HTTP_SERVER_URL}/api/user/${user._id}`, {
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Authorization-JWT': token,
        },
        method: 'DELETE',
    });
}

function checkOk(res: Response[], message: string) {
    if (res.every((res) => res.status === 200 || res.status === 204)) console.log('all done', message, res.length);
    else
        console.error(
            'error',
            message,
            res.map((r) => r.status)
        );
}

function getDicovery({ user, token }: UserWithToken) {
    return fetch(`${config.HTTP_SERVER_URL}/api/discovery`, {
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Authorization-JWT': token,
        },
        method: 'GET',
    });
}

function pairDiscovered(device: IDiscovery, { user, token }: UserWithToken) {
    return fetch(`${config.HTTP_SERVER_URL}/api/discovery/${device._id}`, {
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Authorization-JWT': token,
        },
        method: 'POST',
        body: JSON.stringify({
            formData: {
                CREATE_DEVICE: {
                    info: {
                        name: device.name,
                        location: {
                            building: 'doma',
                            room: 'pokoj',
                        },
                    },
                },
            },
        }),
    });
}

function deleteDevice(device: IDevice, { user, token }: UserWithToken) {
    return fetch(`${config.HTTP_SERVER_URL}/api/device/${device._id}`, {
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Authorization-JWT': token,
        },
        method: 'DELETE',
    });
}
