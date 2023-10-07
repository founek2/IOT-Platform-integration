import { parse } from "https://deno.land/std@0.202.0/yaml/mod.ts";
import { args, EarlyExitFlag, Option } from "https://deno.land/x/args@2.1.1/index.ts"
import { Text } from "https://deno.land/x/args@2.1.1/value-types.ts";
import { Config, ConfigGeneral, Module, SchemaGeneral, FactoryFn, ConfigDevice, FactoryReturn } from "./types.ts";
import SchemaValidator, { string } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { Logger, logger } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts"
import { PARSE_FAILURE } from "https://deno.land/x/args@2.1.1/symbols.ts";

const modules = {} as { [key: string]: Module };
for await (const dirEntry of Deno.readDir("src/devices")) {
    if (!dirEntry.isFile) continue

    const modName = dirEntry.name.replace(".ts", "");
    logger.debug(`Loading module ${modName}`)

    // Load only modules exporting factory function
    const mod = await import(`./devices/${dirEntry.name}`);
    if (mod.factory) {
        modules[modName] = mod
    }
}

for await (const dirEntry of Deno.readDir("src/bridges")) {
    if (!dirEntry.isFile) continue

    const modName = dirEntry.name.replace(".ts", "");
    logger.debug(`Loading module ${modName}`)

    // Load only modules exporting factory function
    const mod = await import(`./bridges/${dirEntry.name}`);
    if (mod.factory) {
        modules[modName] = mod
    }
}

const loadedModuleNames = Object.keys(modules);
logger.info("Modules registered:", loadedModuleNames.join(", "))

const parser = args
    .describe('Add or subtract two numbers')
    .with(
        EarlyExitFlag('help', {
            describe: 'Show help',
            exit() {
                logger.error(parser.help())
                return Deno.exit()
            },
        }),
    )
    .with(
        Option('config', {
            type: Text,
            describe: 'path to config.yaml file',
        }),
    )

const res = parser.parse(Deno.args)
if (res.error) {
    logger.error(res.error.toString())
    Deno.exit(1)
}

const configFilePath = res.value.config
const yamlConfig = await Deno.readTextFile(configFilePath);

const configRaw: any = parse(yamlConfig);

let config: Config
try {
    config = SchemaGeneral.validator(configRaw) as unknown as Config
    logger.info("Config loaded", JSON.stringify(config))
} catch (err) {
    logger.error(`Config validation failed, ${err.message}`)
    Deno.exit(1)
}

// const a = (Object.keys(modules) as unknown as string[]) as const;
const SchemaDevice = SchemaValidator({
    name: string,
    type: string.regexp(new RegExp(`^(${loadedModuleNames.join("|")})$`)).error(`Expect type to be one of ${loadedModuleNames.join(", ")}`),
})

function constructDevice(id: string, device: ConfigDevice) {
    const module = modules[device.type]
    const data = { id, ...device };

    try {
        SchemaDevice.validator(data)

        // Skip validation if Schema not present
        module.Schema?.validator(data)
        if (!data.name) throw new Error("Missing name")
    } catch (err) {
        console.log(data)
        const [path, reason] = err.message.split(":") as [string, string];
        const value = path.split(".").reduce((acc, key) => acc ? (acc as any)[key] : acc, data)
        logger.error(`Data validation failed. ${reason.trim()}, path: ${[id, path].join(".")}, provided value:`, value)
        return
    }

    let log = Object.fromEntries(Object.entries(logger).map(([k, fn]) => [k, (...arr: any[]) => fn(`Device ${id}:`, ...arr)])) as Logger

    return module.factory({
        userName: config.userName,
        mqtt: config.mqtt,
    }, data, log)
}

const devices: FactoryReturn[] = [];
for (const [id, device] of Object.entries(config.devices || {})) {
    const instance = await constructDevice(id, device)
    if (!instance) continue

    logger.info(`Registered device ${id}`)
    devices.push(instance)
}

const bridges: FactoryReturn[] = [];
for (const [id, bridge] of Object.entries(config.bridges || {})) {
    const instance = await constructDevice(id, bridge)
    if (!instance) continue

    logger.info(`Registered bridge ${id}`)
    bridges.push(instance)
}

async function shutdown() {
    logger.info("Shutting down...")
    const promises1 = devices.map(plat => plat.cleanUp())
    const promises2 = bridges.map(plat => plat.cleanUp())
    await Promise.all(promises1)
    await Promise.all(promises2)
    Deno.exit(0)
}

Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);
Deno.addSignalListener("SIGQUIT", shutdown);