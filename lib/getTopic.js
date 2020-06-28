const fetch = require("node-fetch")
const conf = require("../config")

module.exports = async (API_KEY) => {
    const res = await fetch(`${conf.HTTP_SERVER_URL}/api/iot/topic?API_KEY=${API_KEY}`)
    const topic = await res.text()
    return topic
}