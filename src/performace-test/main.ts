import fetch, { Response } from "node-fetch";
import { IUser } from "../lib/type";
import { UsersManager } from "./UsersManager";
import { DevicesManager } from "./DevicesManager";

async function main() {
    const users = new UsersManager(2);
    await users.createAll();

    const devices = new DevicesManager(100);
    await devices.createAll(users.objects.map((obj) => obj.user));

    await sleep(3000);

    await users.pairAllDevices();

    await sleep(60 * 1000);

    await devices.deleteAll();
    await users.deleteAllDevices();

    await users.deleteAll();

    process.exit(0);
}

main();

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
