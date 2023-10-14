import { FactoryFn } from '../types.ts';
import SchemaValidator, { string, array, Type, object } from 'https://denoporter.sirjosh.workers.dev/v1/deno.land/x/computed_types/src/index.ts';
import { Logger } from 'https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts';
import { UnifiClient } from './unifi/unifiClient.ts';

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

type ActionConfig = Type<typeof SchemaAction>;

export const Schema = SchemaValidator({
    unifiControllerUrl: string,
    unifiUserName: string,
    unifiPassword: string,
    unifiWatcher: array.of(SchemaAction),
})

type WatcherConfig = Type<typeof Schema>;

const MINUTES_30 = 30 * 60 * 1000;
const cache: Record<string, boolean | undefined> = {}

export const factory: FactoryFn<WatcherConfig> = function (_config, device, logger) {

    const client = new UnifiClient(device.unifiControllerUrl, device.unifiUserName, device.unifiPassword)

    async function runSync() {
        await client.login()
        const activeDevices = await client.listActiveDevices()

        for (const { hosts, webhooksUp, webhooksDown } of device.unifiWatcher) {

            const isOnline = activeDevices.some(d => hosts.includes(d.ip))
            const cacheKey = hosts.join();
            if (isOnline && !cache[cacheKey]) {
                cache[cacheKey] = isOnline

                callAllWebhooks(webhooksUp, logger)
            } else if (!isOnline && cache[cacheKey]) {
                cache[cacheKey] = isOnline

                callAllWebhooks(webhooksDown, logger)
            }
        }
    }

    runSync()
    const interval = setInterval(runSync, MINUTES_30)

    return {
        cleanUp: async function () {
            clearInterval(interval)

            for (const { webhooksDown } of device.unifiWatcher) {
                await callAllWebhooks(webhooksDown, logger)
            }
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