const connection = require("../lib/connection")
const conf = require("../config")

async function main() {
    const { topic, client } = await connection(conf.API_KEYS.METEO)
    console.log("meteo topic:", topic)

    client.on('connect', function () {
        console.log("connected")
        client.publish(topic, JSON.stringify({
            temp: 10,
            hum: 80,
            volt: 3.7,
            press: 1211,
        }))
        // client.disc

        client.on("error", function (err) {
            console.log("mqtt connection error")
            // client.reconnect()
        })
    })
}

main()