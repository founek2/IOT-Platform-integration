import { Platform, ComponentType, PropertyDataType, Logger } from "iot-platform/deno"
import { FactoryFn } from '../types.ts';
import SchemaValidator, { Type, string } from 'computed_types';
import plexPinAuth from "npm:plex-api-pinauth";
import PlexAPI from "npm:plex-api";
import { client as WebSocketClient } from "npm:websocket";

type Pin = { code: string, id: string };

export const Schema = SchemaValidator({
    plexUri: string,
    plexToken: string.optional(),
    plexDeviceName: string
})

type BraviaConfig = Type<typeof Schema>;

export const factory: FactoryFn<BraviaConfig> = function (config, device, logger, storage) {
    const url = new URL(device.plexUri);
    const authenticator = plexPinAuth();
    const plexClient = new PlexAPI({
        hostname: url.hostname,
        port: url.port || (url.protocol === "https" ? 443 : 80),
        https: url.protocol === "https",
        token: device.plexToken,
        authenticator,
        options: {
            identifier: device.id,
            product: "IoT Domu",
            deviceName: "IoT Domu integration",
        }
    });

    const plat = new Platform(device.id, config.userName, device.name, config.mqtt.uri, config.mqtt.port, storage);

    const nodeLight = plat.addNode('player', 'Přehrávač', ComponentType.switch);
    const powerProperty = nodeLight.addProperty({
        propertyId: 'playing',
        dataType: PropertyDataType.boolean,
        name: 'Přehrávání',
    });

    let client: any;
    if (!device.plexToken) {
        authenticate(authenticator, logger)
    } else {
        client = subscibe(plexClient, device.plexToken, device.plexDeviceName, url, (v: boolean) => powerProperty.setValue(v ? "true" : "false"))
    }

    // const volumeProperty = nodeLight.addProperty({
    //     propertyId: 'volume',
    //     dataType: PropertyDataType.integer,
    //     format: '0:80',
    //     name: 'TV',
    //     settable: true,
    //     callback: handleAction(async (newValue) => {
    //         await bravia.setVolume(newValue);
    //         return true
    //     })
    // });

    // const muteProperty = nodeLight.addProperty({
    //     propertyId: 'mute',
    //     dataType: PropertyDataType.boolean,
    //     name: 'Ztlumit',
    //     settable: true,
    //     callback: handleAction(async (newValue) => {
    //         if (newValue == "true")
    //             await bravia.muteSpeaker()
    //         else
    //             await bravia.unmuteSpeaker()
    //         return true
    //     }),
    // });

    plat.init();

    return {
        cleanUp: function () {
            if (client) client.abort()
            plat.disconnect()
        },
        healthCheck: function () {
            return {
                deviceId: plat.deviceId,
                connected: plat.client.connected
            }
        }
    };
}

function authenticate(authenticator: any, logger: Logger) {
    authenticator.getNewPin().then(function (pin: Pin) {
        logger.warning(`Vist https://www.plex.tv/link and pass code "${pin.code}"`);

        logger.debug("Waiting for authentication...")
        checkPin(pin)
    });

    const checkPin = (pin: Pin) => {
        authenticator.checkPinForAuth(pin, function callback(err: any, status: "authorized" | "waiting" | "invalid") {
            if (err) {
                logger.error(err)
            } else if (status === "waiting") {
                setTimeout(() => checkPin(pin), 1000)
            } else if (status == "authorized") {
                logger.info(`Authorization successful, set token to config: "${authenticator.token}"`)
                // plexClient.token
            } else {
                logger.debug("failed requesting auth token")
            }
        });
    }
}

async function subscibe(plexClient: any, token: string, deviceName: string, url: URL, onChange: (v: boolean) => any) {
    const { MediaContainer: { Device: devices } } = await plexClient.query("/devices");
    const client = new WebSocketClient();

    client.on('connectFailed', function (error: any) {
        console.log('Connect Error: ' + error.toString());
    });

    const cache = {} as { playing?: boolean };
    client.on('connect', function (connection: any) {
        console.log('WebSocket Client Connected');
        connection.on('error', function (error: any) {
            console.log("Connection Error: " + error.toString());
        });
        connection.on('close', function () {
            console.log('echo-protocol Connection Closed');
        });
        connection.on('message', function (message: any) {
            if (message.type === 'utf8') {
                const data = JSON.parse(message.utf8Data);

                const notififcation = data.NotificationContainer.PlaySessionStateNotification[0]
                const device = devices.find((d: any) => d.clientIdentifier === notififcation.clientIdentifier)
                const isPlaying = notififcation.state == "playing";

                if (device?.name == deviceName && cache.playing !== isPlaying) {
                    onChange(isPlaying)
                    cache.playing = isPlaying;
                }
            }
        });
    });
    client.connect(`wss://${url.hostname}/:/websockets/notifications?X-Plex-Token=${token}&filters=playing`);

    return client;
}