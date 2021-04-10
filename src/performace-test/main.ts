import { DevicesManager } from "./DevicesManager";
import { UsersManager } from "./UsersManager";
import { sleep } from "../lib/utils";
import { localStorage } from "../lib/storage";

async function main() {
    localStorage.clear();
    let users = new UsersManager(20);
    let devices = new DevicesManager(200);

    try {
        await users.createAll();

        await devices.createAll(users.objects.map((obj) => obj.user));

        // await sleep(60);

        await users.pairAllDevices(devices.count);

        await sleep(10);
    } catch (err) {
        console.log(err)
    }

    try {
        await devices.deleteAll();

        await sleep(2);
    } catch (err) { }

    try {
        await users.deleteAllDevices();
    } catch (err) { }

    try {
        await users.deleteAll();
    } catch (err) { }

    process.exit(0);
}

main();

