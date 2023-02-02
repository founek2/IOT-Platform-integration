import assert from 'assert';
import { join } from 'path';

const result = require('dotenv').config({
    path: join(__dirname, '../.env'),
});
if (result.error) console.error(result.error);

export default {
    MQTT_SERVER_URL: process.env.MQTT_SERVER_URL as string,
    MQTT_SERVER_PORT: Number(process.env.MQTT_SERVER_PORT as string),
    STORAGE_PATH: process.env.STORAGE_PATH || 'local-storage',
    HTTP_SERVER_URL: process.env.HTTP_SERVER_URL as string,
};

assert(process.env.MQTT_SERVER_URL, 'missing env MQTT_SERVER_URL');
assert(process.env.MQTT_SERVER_PORT, 'missing env MQTT_SERVER_PORT');
