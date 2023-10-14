import { FactoryFn } from '../types.ts';
import SchemaValidator, { string, array, Type } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { Logger } from 'https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts';
// @deno-types="npm:@types/ping@0.4.2"
import ping from "npm:ping@0.4.4"
import parse from "npm:parse-duration@1.1.0"

const SchemaWebhook = SchemaValidator({
    url: string,
    method: string.optional("POST"),
    apiKey: string.optional(),
})
const SchemaAction = SchemaValidator({
    webhooks: array.of(SchemaWebhook),
    hosts: array.of(string),
    duration: string.optional("2d")
})

type ActionConfig = Type<typeof SchemaAction>;

export const Schema = SchemaValidator({
    watcherActions: array.of(SchemaAction),
})

type WatcherConfig = Type<typeof Schema>;

const MINUTES_15 = 15 * 60 * 1000;
let timeout: number;
export const factory: FactoryFn<WatcherConfig> = function (_config, device, logger) {

    pingAllHosts(device.watcherActions, logger)
    const interval = setInterval(function () {
        pingAllHosts(device.watcherActions, logger)
    }, MINUTES_15)

    return {
        cleanUp: function () {
            clearInterval(interval)
            clearTimeout(timeout)
        },
        healthCheck: function () {
            return {
                deviceId: device.id,
                connected: true
            }
        }
    }
}

async function callAllWebhooks(webhooks: ActionConfig["webhooks"], value: string, logger: Logger) {
    for (const { url, method, apiKey } of webhooks) {
        console.log(`${url}${value}`)
        const result = await fetch(`${url}${value}`, {
            method,
            headers: {
                "X-API-Key": apiKey || "",
            }
        })

        if (!result.ok)
            logger.error("Webhook failed with status", result.status)
        else logger.debug("Webhook send", result.status)
    }
}

let cache: Record<string, boolean | undefined> = {}

async function pingAllHosts(watcherActions: WatcherConfig["watcherActions"], logger: Logger) {
    for (const { hosts, webhooks, duration } of watcherActions) {
        const pings = await pingHosts(hosts)

        const isAlive = pings.some(v => v === true)
        const cacheKey = hosts.join();
        if (isAlive && isAlive !== cache[cacheKey]) {
            cache[cacheKey] = isAlive;

            clearTimeout(timeout)
            timeout = setTimeout(() => {
                cache = {};
                logger.info("Reverting webhooks")
                callAllWebhooks(webhooks, "false", logger)
            }, parse(duration))
            console.log(duration, parse(duration))

            logger.info("Calling webhooks")
            callAllWebhooks(webhooks, "true", logger)
        }

    }
}

function pingHost(ip: string) {
    return new Promise<boolean>((resolve) => {
        ping.sys.probe(ip, v => resolve(v || false))
    })
}

function pingHosts(hosts: string[]) {
    const pings = hosts.map(pingHost)
    return Promise.all(pings)
}