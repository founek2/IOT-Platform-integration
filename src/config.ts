import { join } from 'path';

const result = require('dotenv').config({
    path: join(__dirname, '../.env')
});
if (result.error) console.error(result.error);
console.log("config", result.parsed)

export default {
    MQTT_SERVER_URL: result.parsed.MQTT_SERVER_URL,
    MQTT_SERVER_PORT: Number(result.parsed.MQTT_SERVER_PORT),
    STORAGE_PATH: result.parsed.STORAGE_PATH,
    HTTP_SERVER_URL: result.parsed.HTTP_SERVER_URL
};
