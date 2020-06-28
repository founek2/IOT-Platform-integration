const mqtt = require('mqtt')
const getTopic = require("./getTopic")
const conf = require("../config")

module.exports = async (API_KEY) => {
    const client = mqtt.connect(conf.MQTT_SERVER_URL, {
        username: API_KEY,
        password: "kekel",
        port: conf.MQTT_SERVER_PORT,
        connectTimeout: 20 * 1000,
        rejectUnauthorized: false
    })

    const topic = await getTopic(API_KEY)

    return {
        topic,
        client,
    }
}