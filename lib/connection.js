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

    client.on("connect", function () {
        sendAck(topic, client)
        setInterval(() => sendAck(topic, client), 3 * 60 * 1000)
    })

    return {
        topic,
        client,
    }
}

function sendAck(topic, client) {
    client.publish(topic + "/ack", JSON.stringify({ ack: 1 }))
}