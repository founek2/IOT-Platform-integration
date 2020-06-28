const connection = require("../lib/connection")
const si = require('systeminformation');
const conf = require("../config")

async function main() {
    const { topic, client } = await connection(conf.API_KEYS.SYSTEM)
    console.log("system topic:", topic)

    client.on('connect', async function () {
        console.log("connected")
        const sender = () => sendInfo(topic, client)

        sender()
        setInterval(sender, 30 * 1000)  // every 30s

        client.on("error", function (err) {
            console.log("mqtt connection error")
            // client.reconnect()
        })
    })
}

async function sendInfo(topic, client) {
    const data2 = await si.battery();
    const data5 = await si.mem()
    const data6 = await si.currentLoad()

    const coef = data5.total / 100

    const data = {
        mem: Math.floor(data5.active / coef),
        usedM: Math.floor(data5.used / coef),
        usage: Math.floor(data6.currentload),
        volt: data2.voltage,
    }
    console.log(data)

    client.publish(topic, JSON.stringify(data))
    console.log("sending data")
}

main()