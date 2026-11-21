import { parse } from "https://deno.land/std@0.202.0/yaml/mod.ts";
import { args, EarlyExitFlag, Option } from "https://deno.land/x/args@2.1.1/index.ts"
import { Text } from "https://deno.land/x/args@2.1.1/value-types.ts";
import { Config, Module, SchemaGeneral, ConfigDevice, FactoryReturn, ModuleType } from "./types.ts";
import { z } from "zod";
import { Logger, logger } from "iot-platform/deno"
import { startHealthcheckServer } from "./server.ts";
import { LocalStorage } from "./localstorage.ts";

const modules: Record<ModuleType, Record<string, Module>> = {
    [ModuleType.devices]: {},
    [ModuleType.bridges]: {},
    [ModuleType.bots]: {},
    [ModuleType.custom]: {},
}
const moduleTypes = Object.values(ModuleType)

for (const moduleType of moduleTypes) {
    for await (const dirEntry of Deno.readDir(`src/${moduleType}`)) {
        if (!dirEntry.isFile) continue

        const modName = dirEntry.name.replace(".ts", "");

        const mod = await import(`./${moduleType}/${dirEntry.name}`);
        if (mod.factory) {
            logger.info(`Loaded module ${modName}`)
            modules[moduleType][modName] = mod
        }
    }
}

const loadedModuleNames = Object.values(modules).map(modules => Object.keys(modules)).flat();
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

const configRaw: unknown = parse(yamlConfig);

let config: Config
try {
    config = SchemaGeneral.parse(configRaw)
    logger.info("Config loaded", JSON.stringify(config))
} catch (err) {
    if (!(err instanceof z.ZodError)) throw err;
    for (const issue of err.issues) {
        logger.error(`Config validation failed, ${issue.message}, path: ${issue.path.join(".")}`)
    }
    Deno.exit(1)
}

const SchemaDevice = z.looseObject({
    name: z.string().min(1),
    type: z.string(),
});

const localstorage = new LocalStorage(Deno.env.get("STORAGE_PATH") || "local-storage")

function constructDevice(id: string, device: ConfigDevice, module: Module) {
    const data = { id, ...device };

    try {
        // Skip validation if Schema not present
        module.Schema?.parse(data)
    } catch (err) {
        if (!(err instanceof z.ZodError)) throw err;
        for (const issue of err.issues) {
            logger.error(`Data validation failed. ${issue.message}, path: ${[id, ...issue.path].join(".")}`)
        }
        return
    }

    const log = Object.fromEntries(Object.entries(logger).map(([k, fn]) => [k, (...arr: any[]) => fn(`Device ${id}:`, ...arr)])) as Logger

    return module.factory({
        userName: config.userName,
        mqtt: config.mqtt,
    }, data, log, localstorage)
}

const devices: Record<ModuleType, FactoryReturn[]> = {
    [ModuleType.bridges]: [],
    [ModuleType.devices]: [],
    [ModuleType.bots]: [],
    [ModuleType.custom]: [],
};
for (const moduleType of moduleTypes) {
    for (const [id, value] of Object.entries(config[moduleType] || {})) {
        const result = SchemaDevice.safeParse(value);
        if (!result.success) {
            for (const issue of result.error.issues) {
                logger.error(`Data validation failed. ${issue.message}, path: ${[id, ...issue.path].join(".")}`)
            }
            continue;
        }
        const device = result.data;
        const module = modules[moduleType][device.type]
        if (!module) {
            logger.error(`Invalid type '${device.type}', supported ${Object.keys(modules[moduleType]).join(",")}`)
            continue
        }

        try {
            const instance = await constructDevice(id, device, module)
            if (!instance) continue

            logger.info(`Registered ${moduleType} ${id}`)
            devices[moduleType].push(instance)
        } catch (err) {
            logger.error(`Failed to register ${moduleType} ${id}`, err)
        }
    }
}

async function shutdown() {
    logger.info("Shutting down...")
    const promises = Object.values(devices).flat().map(plat => plat.cleanUp())
    await Promise.all(promises)
    Deno.exit(0)
}

Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);
Deno.addSignalListener("SIGQUIT", shutdown);

startHealthcheckServer(Object.values(devices).flat())