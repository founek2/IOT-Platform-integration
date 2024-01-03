import EventEmitter from "https://deno.land/x/eventemitter@1.2.4/mod.ts"
import { Input, Power, YamahaEvent } from "./type.ts";

class YamahaEventListener extends EventEmitter<{
    power(value: Power): any
    input(value: Input): any
    volume(value: number): any
}> {
    con?: Deno.DatagramConn
    sourceIp: string
    eventPort?: number

    constructor(sourceIp: string, port?: number) {
        super()

        this.sourceIp = sourceIp;
        this.eventPort = port;
        if (!port) return

        this.con = Deno.listenDatagram({ port, transport: "udp", hostname: "0.0.0.0" });
        this.handle()
    }

    async handle() {
        if (!this.con) return

        const decoder = new TextDecoder()

        for await (const [data, source] of this.con) {
            if (this.sourceIp !== (source as Deno.NetAddr).hostname) continue;

            const body = JSON.parse(decoder.decode(data)) as YamahaEvent;

            if (body.main?.power) this.emit("power", body.main.power)
            if (body.main?.volume) this.emit("volume", body.main.volume)
            if (body.main?.input) this.emit("input", body.main.input)
        }
    }
}

// const evenListener = new YamahaEventListener(EVENTS_PORT)

export enum YamahaInput {
    net_radio = "net_radio",
    bluetooth = "bluetooth",
    airplay = "airplay",
    tuner = "tuner",
    line1 = "line1"
}

export class YamahaClient extends YamahaEventListener {
    server: string
    power?: Power;
    volume?: number;
    input?: YamahaInput;

    constructor(ip: string, eventPort?: number) {
        super(ip, eventPort)

        this.server = `http://${ip}`

        this.on("power", (v) => this.power = v)
        this.on("input", (v) => this.input = (v as YamahaInput))
        this.on("volume", (v) => this.volume = v)
    }

    sendRequest(path: string) {
        return fetch(this.server + path, {
            headers: {
                "X-AppName": "MusicCast/1.0(deno)",
                "X-AppPort": String(this.eventPort || ""),
            }
        })
    }

    async sync() {
        const res = await this.sendRequest("/YamahaExtendedControl/v1/main/getStatus")
        if (!res.ok) return this;
        const body = await res.json()

        this.power = body["power"]
        this.volume = body["volume"]
        this.input = body["input"]

        return this;
    }

    async powerOn() {
        const res = await this.sendRequest("/YamahaExtendedControl/v1/main/setPower?power=on")
        if (!res.ok) return false

        this.power = "on"
        return true
    }

    async powerOff() {
        const res = await this.sendRequest("/YamahaExtendedControl/v1/main/setPower?power=standby")
        if (!res.ok) return false;

        this.power = "standby"
        return true;
    };

    async setInput(input: YamahaInput) {
        const res = await this.sendRequest(`/YamahaExtendedControl/v1/main/setInput?input=${input}`)
        if (!res.ok) return false;

        this.input = input
        return true;
    };

    async setVolume(volume: number) {
        if (volume < 0 || volume > 100)
            return false;

        const res = await this.sendRequest(`/YamahaExtendedControl/v1/main/setVolume?volume=${volume}`)
        if (!res.ok) return false;

        this.volume = volume
        return true;
    };


    getPower() {
        return this.power;
    }

    getVolume() {
        return this.volume;
    }

    getInput() {
        return this.input;
    }
};