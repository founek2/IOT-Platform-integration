const connection = require("../lib/connection")
const conf = require("../config")

async function main() {
    const { topic, client } = await connection(conf.API_KEY_LIGHT)
    console.log("light topic:", topic)

    client.on('connect', function () {
        console.log("connected")

        client.publish(topic + "/initControl", JSON.stringify({
            rgb: {
                on: 1,
                bright: 88
            }
        }))
        client.publish(topic + "/initControl", JSON.stringify({
            rgb: {
                color: "#00bcd4",
                type: "linear",
            }
        }))
        client.publish(topic + "/initControl", JSON.stringify({
            relay: {
                on: 0
            }
        }))
        client.publish(topic + "/ack", JSON.stringify({ ack: 1 }))

        client.subscribe(topic + "/update")

        client.on("error", function (err) {
            console.log("mqtt connection error")
            // client.reconnect()
        })
    })

    client.on("message", async function (tpc, message) {
        if (tpc == topic + "/update") {
            const data = JSON.parse(message.toString())

            if (data.rgb)
                console.log("Message RGB>", data.rgb)

            if (data.relay)
                console.log("Message relay>", data.relay)

            if (data.relay || data.rgb)
                client.publish(topic + "/ack", message)
        }
    })
}

main()