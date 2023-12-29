import Bravia from "npm:bravia@^1.3.3";

interface VolumeInfo { target: "speaker" | "headphone", volume: number, mute: boolean, maxVolume: number, minVolume: number }

function getSpeakerVolume(info: VolumeInfo[]) {
    return info.find(obj => obj.target === 'speaker')?.volume;
}
function getHeadphoneVolume(info: VolumeInfo[]) {
    return info.find(obj => obj.target === 'headphone')?.volume;
}


export class BraviaClient {
    bravia: any
    power?: "active" | "standby"
    volumeSpeaker?: number
    volumeHeadphone?: number
    activeAudioTarget?: "speaker" | "headphone"

    constructor(ip: string, psk: number) {
        this.bravia = new Bravia(ip, '80', psk);

        // this.bravia.audio.getMethodTypes()
        //     .then((commands: any) => console.log(commands))
        //     .catch((error: any) => console.error(error));

        // this.bravia.audio.invoke("getSoundSettings", "1.1", { target: "outputTerminal" }).then((t: any) => console.log(t))
        // this.bravia.audio.invoke("setSoundSettings", "1.1", {
        //     settings: [{
        //         "value": "audioSystem", // audioSystem=tv, speaker=external 
        //         "target": "outputTerminal"
        //     }]
        // })
    }

    async sync() {
        await this.fetchPowerStatus()
        if (this.power == "active") {
            await this.fetchVolume()
            await this.fetchAudioTarget()
        }
    }
    async fetchVolume() {
        const info: VolumeInfo[] = await this.bravia.audio.invoke('getVolumeInformation');
        this.volumeSpeaker = getSpeakerVolume(info)
        this.volumeHeadphone = getHeadphoneVolume(info)
    }

    async fetchPowerStatus() {
        const info = await this.bravia.system.invoke('getPowerStatus');
        this.power = info.status;
    }

    async fetchAudioTarget() {
        const data = await this.bravia.audio.invoke("getSoundSettings", "1.1", { target: "outputTerminal" })
        const currentValue = data[0].currentValue as "speaker" | "audioSystem";
        this.activeAudioTarget = currentValue === "audioSystem" ? "speaker" : "headphone"
    }

    getVolume() {
        return this.volumeSpeaker
    }

    getPowerStatus() {
        return this.power
    }

    isMuted() {
        return this.activeAudioTarget === "headphone"
    }

    setVolume(volume: string, target?: "speaker" | "headphone") {
        if (!target && this.activeAudioTarget)
            target = this.activeAudioTarget!

        return this.bravia.audio.invoke('setAudioVolume', '1.0', {
            target,
            volume: volume,
        });
    }

    setPowerStatus(bool: boolean) {
        return this.bravia.system.invoke('setPowerStatus', '1.0', { status: bool });
    }

    // TODO look into https://pro-bravia.sony.net/develop/integrate/rest-api/spec/service/audio/v1_1/setSoundSettings/index.html
    // for switching audio
    // async muteSpeaker() {
    //     // Retrieve current volume and preserve it
    //     await this.fetchVolume()

    //     await this.setVolume("0", "speaker")
    //     this.volumeSpeaker = 0
    // }
    async muteSpeaker() {
        await this.bravia.audio.invoke("setSoundSettings", "1.1", {
            settings: [{
                "value": "speaker", // audioSystem=tv, speaker=external 
                "target": "outputTerminal"
            }]
        })
        await this.fetchAudioTarget()
    }

    // async unmuteSpeaker() {
    //     const volume = 17
    //     await this.setVolume(String(volume), "speaker")
    //     this.volumeSpeaker = volume
    // }
    async unmuteSpeaker() {
        await this.bravia.audio.invoke("setSoundSettings", "1.1", {
            settings: [{
                "value": "audioSystem", // audioSystem=tv, speaker=external 
                "target": "outputTerminal"
            }]
        })
        await this.fetchAudioTarget()
    }
};