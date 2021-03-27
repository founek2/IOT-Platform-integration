const path = require('path');

const result = require('dotenv').config({
	path: path.join(__dirname, '../.env')
});
if (result.error) console.error(error);

module.exports = {
	MQTT_SERVER_URL: result.parsed.MQTT_SERVER_URL,
	MQTT_SERVER_PORT: Number(result.parsed.MQTT_SERVER_PORT),
	STORAGE_PATH: result.parsed.STORAGE_PATH
};
