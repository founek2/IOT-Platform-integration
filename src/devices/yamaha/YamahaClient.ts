import EventEmitter from "https://deno.land/x/eventemitter@1.2.4/mod.ts"
import { Input, Power, YamahaEvent } from "./type.ts";

export enum YamahaInput {
    net_radio = "net_radio",
    tv = "tv",
    bluetooth = "bluetooth",
    airplay = "airplay",
    tuner = "tuner",
    line1 = "line1"
}

export class YamahaClient extends EventEmitter<{
    power(value: Power): any
    input(value: Input): any
    volume(value: number): any
    maxVolume(value: number): any
}> {
    ip: string
    eventPort?: number;
    con?: Deno.DatagramConn

    power?: Power;
    volume?: number;
    maxVolume?: number;
    input?: YamahaInput;

    constructor(ip: string, eventPort?: number) {
        super()

        this.ip = ip
        this.eventPort = eventPort

        this.on("power", (v) => this.power = v)
        this.on("input", (v) => this.input = (v as YamahaInput))
        this.on("volume", (v) => this.volume = v)
        this.on("maxVolume", (v) => this.maxVolume = v)

        if (!this.eventPort) return;

        this.con = Deno.listenDatagram({ port: this.eventPort, transport: "udp", hostname: "0.0.0.0" });
        this._handleEvents()
    }

    async _handleEvents() {
        if (!this.con) return

        const decoder = new TextDecoder()
        for await (const [data, source] of this.con) {
            if (this.ip !== (source as Deno.NetAddr).hostname) continue;

            const body = JSON.parse(decoder.decode(data)) as YamahaEvent;

            if (body.main?.power && this.power !== body.main?.power) this.emit("power", body.main.power)
            if (body.main?.volume && this.volume !== body.main?.volume) this.emit("volume", body.main.volume)
            if (body.main?.input && this.input !== body.main?.input) this.emit("input", body.main.input)
        }
    }

    sendRequest(path: string) {
        return fetch(`http://${this.ip}${path}`, {
            headers: {
                "X-AppName": "MusicCast/1.0(deno)",
                "X-AppPort": String(this.eventPort || ""),
            }
        })
    }

    async sync() {
        const res = await this.sendRequest("/YamahaExtendedControl/v1/main/getStatus")
        if (!res.ok) return this;
        const data = await res.json()
        const { power, volume, input, max_volume } = data;

        if (this.power !== power) this._emitPower(power)
        if (this.volume !== volume) this._emitVolume(volume)
        if (this.input !== input) this._emitInput(input)
        if (this.maxVolume !== max_volume) this._emitMaxVolume(max_volume)

        return this;
    }

    async powerOn() {
        const res = await this.sendRequest("/YamahaExtendedControl/v1/main/setPower?power=on")
        if (!res.ok) return false

        this._emitPower("on")
        return true
    }

    async powerOff() {
        const res = await this.sendRequest("/YamahaExtendedControl/v1/main/setPower?power=standby")
        if (!res.ok) return false;

        this._emitPower("standby")
        return true;
    };

    async setInput(input: YamahaInput) {
        const res = await this.sendRequest(`/YamahaExtendedControl/v1/main/setInput?input=${input}`)
        if (!res.ok) return false;

        this._emitInput(input)
        return true;
    };

    async setVolume(volume: number) {
        if (volume < 0 || volume > (this.maxVolume || 100))
            return false;

        const res = await this.sendRequest(`/YamahaExtendedControl/v1/main/setVolume?volume=${volume}`)
        if (!res.ok) return false;

        this._emitVolume(volume)
        return true;
    };


    getPower() {
        return this.power;
    }

    getVolume() {
        return this.volume;
    }

    getMaxVolume() {
        return this.maxVolume;
    }

    getInput() {
        return this.input;
    }

    _emitPower(power: Power) {
        this.emit("power", power)
    }

    _emitInput(input: Input) {
        this.emit("input", input)
    }

    _emitVolume(volume: number) {
        this.emit("volume", volume)
    }

    _emitMaxVolume(volume: number) {
        this.emit("maxVolume", volume)
    }
};