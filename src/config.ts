import { assert } from "@std/assert";
import "@std/dotenv";

const config = {
    MQTT_SERVER_URL: Deno.env.get("MQTT_SERVER_URL") as string,
    MQTT_SERVER_PORT: Number(Deno.env.get("MQTT_SERVER_PORT") as string),
    STORAGE_PATH: Deno.env.get("STORAGE_PATH") || 'local-storage',
    HTTP_SERVER_URL: Deno.env.get("HTTP_SERVER_URL") as string,
};

assert(config.MQTT_SERVER_URL, 'missing env MQTT_SERVER_URL');
assert(config.MQTT_SERVER_PORT, 'missing env MQTT_SERVER_PORT');

export default config