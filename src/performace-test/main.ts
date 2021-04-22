import { DevicesManager } from "./DevicesManager";
import { UsersManager } from "./UsersManager";
import { sleep } from "../lib/utils";
import { localStorage } from "../lib/storage";

async function main() {
    localStorage.clear();
    let users = new UsersManager(25);
    let devices = new DevicesManager(250);

    try {
        await users.createAll();

        await devices.createAll(users.objects.map((obj) => obj.user));

        await sleep(120);

        await users.pairAllDevices(devices.count);

        console.log("Let the party begin!")
        await sleep(10 * 60);
    } catch (err) {
        console.log(err)
    }

    try {
        await devices.deleteAll();

        await sleep(5);
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

