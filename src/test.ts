var mqtt = require('mqtt');
var client = mqtt.connect('mqtts://v3.iotplatforma.cloud', {
    username: 'martas',
    password: '481565855',
    port: 8884,
    rejectUnauthorized: false,
});

client.on('connect', function () {
    console.log('connected');

    client.subscribe('#', function (err: any) {
        if (err) console.log(err);
    });

    const options = { retain: true };
    client.publish('v2/deviceId/$homie', '4.0.0', options);
    client.publish('v2/deviceId/$name', 'Zařízení', options);
    client.publish('v2/deviceId/$state', 'ready', options);
    client.publish('v2/deviceId/$extensions', null, options);

    client.publish('v2/deviceId/$nodes', 'light', options);

    client.publish('v2/deviceId/light/$name', 'Světlo', options);
    client.publish('v2/deviceId/light/$types', 'switch', options);
    client.publish('v2/deviceId/light/$properties', 'power,power2,sensor', options);

    client.publish('v2/deviceId/light/power/$name', 'Vypínač', options);
    client.publish('v2/deviceId/light/power/$datatype', 'boolean', options);
    client.publish('v2/deviceId/light/power/$settable', 'true', options);

    client.publish('v2/deviceId/light/power2/$name', 'Vypínač', options);
    client.publish('v2/deviceId/light/power2/$datatype', 'boolean', options);
    client.publish('v2/deviceId/light/power2/$settable', 'true', options);

    client.publish('v2/deviceId/light/sensor/$name', 'Teplota', options);
    client.publish('v2/deviceId/light/sensor/$datatype', 'float', options);
});

client.on('message', function (topic: string, message: Buffer) {
    // message is Buffer
    console.log(message.toString());
});
