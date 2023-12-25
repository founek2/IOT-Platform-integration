

export enum YamahaInput {
    net_radio = "net_radio",
    bluetooth = "bluetooth",
    airplay = "airplay",
    tuner = "tuner",
    line1 = "line1"
}

export class YamahaClient {
    server: string
    power?: "on" | "off";
    volume?: number;
    input?: YamahaInput;

    constructor(ip: string) {
        this.server = `http://${ip}`
    }

    sendRequest(path: string) {
        return fetch(this.server + path)
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

        this.power = "off"
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