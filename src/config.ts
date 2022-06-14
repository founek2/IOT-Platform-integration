import { join } from 'path';

const result = require('dotenv').config({
    path: join(__dirname, '../.env'),
});
if (result.error) console.error(result.error);

export default {
    MQTT_SERVER_URL: process.env.MQTT_SERVER_URL,
    MQTT_SERVER_PORT: Number(process.env.MQTT_SERVER_PORT),
    STORAGE_PATH: process.env.STORAGE_PATH || 'local-storage',
};
