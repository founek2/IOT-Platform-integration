import { FactoryFn, optional, withDefault } from '../types.ts';
import { z } from "zod";
import { Logger } from 'iot-platform/deno';
import { UnifiClient } from './unifi/unifiClient.ts';
import isBefore from "https://deno.land/x/date_fns@v2.15.0/isBefore/index.js";
import addHours from "https://deno.land/x/date_fns@v2.15.0/addHours/index.js";


const SchemaWebhook = z.object({
    url: z.string(),
    method: optional(z.string()),
    headers: withDefault(z.custom<object>((value) => typeof value === "object" && value !== null), {}),
})
type WebhookConfig = z.infer<typeof SchemaWebhook>;

const SchemaAction = z.object({
    webhooksUp: z.array(SchemaWebhook),
    webhooksDown: z.array(SchemaWebhook),
    hosts: z.array(z.string()),
    lastSeen: withDefault(z.string(), "2d")
})

export const Schema = z.object({
    unifiControllerUrl: z.string(),
    unifiUserName: z.string(),
    unifiPassword: z.string(),
    unifiWatcher: z.array(SchemaAction),
})

type WatcherConfig = z.infer<typeof Schema>;

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