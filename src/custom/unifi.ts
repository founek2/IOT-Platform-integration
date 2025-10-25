import { FactoryFn } from '../types.ts';
import SchemaValidator, { string, array, Type, object } from 'computed_types';
import { Logger } from 'iot-platform/deno';
import { UnifiClient } from './unifi/unifiClient.ts';
import isBefore from "https://deno.land/x/date_fns@v2.15.0/isBefore/index.js";
import addHours from "https://deno.land/x/date_fns@v2.15.0/addHours/index.js";


const SchemaWebhook = SchemaValidator({
    url: string,
    method: string.optional(),
    headers: object.optional({}),
})
type WebhookConfig = Type<typeof SchemaWebhook>;

const SchemaAction = SchemaValidator({
    webhooksUp: array.of(SchemaWebhook),
    webhooksDown: array.of(SchemaWebhook),
    hosts: array.of(string),
    lastSeen: string.optional("2d")
})

export const Schema = SchemaValidator({
    unifiControllerUrl: string,
    unifiUserName: string,
    unifiPassword: string,
    unifiWatcher: array.of(SchemaAction),
})

type WatcherConfig = Type<typeof Schema>;

const MINUTES_30 = 30 * 60 * 1000;
const cache: Record<string, { timestamp: Date, value: boolean } | undefined> = {}

export const factory: FactoryFn<WatcherConfig> = function (_config, device, logger) {

    const client = new UnifiClient(device.unifiControllerUrl, device.unifiUserName, device.unifiPassword)

    async function runSync() {
        try {
            await client.login()

            const activeDevices = await client.listActiveDevices()

            for (const { hosts, webhooksUp, webhooksDown } of device.unifiWatcher) {

                const isOnline = activeDevices.some(d => hosts.includes(d.ip))
                const cacheKey = hosts.join();
                const cached = cache[cacheKey];
                const outdated = cached?.timestamp && isBefore(addHours(cached?.timestamp, 3), new Date(), {})

                if (isOnline && (cached?.value !== isOnline || outdated)) {
                    cache[cacheKey] = { value: isOnline, timestamp: new Date() }

                    callAllWebhooks(webhooksUp, logger)
                } else if (!isOnline && (cached?.value !== isOnline || outdated)) {
                    cache[cacheKey] = { value: isOnline, timestamp: new Date() }

                    callAllWebhooks(webhooksDown, logger)
                }
            }
        } catch (err) {
            logger.error(err)
        }
    }

    runSync()
    const interval = setInterval(runSync, MINUTES_30)

    return {
        cleanUp: function () {
            clearInterval(interval)
        },
        healthCheck: function () {
            return {
                deviceId: device.id,
                connected: true
            }
        }
    }
}

async function callAllWebhooks(webhooks: WebhookConfig[], logger: Logger) {
    for (const { url, method, headers } of webhooks) {
        const result = await fetch(url, {
            method: method || "POST",
            headers: {
                ...headers
            }
        })

        if (!result.ok)
            logger.error("Webhook failed with status", result.status)
        else logger.debug("Webhook send", result.status)
    }
}