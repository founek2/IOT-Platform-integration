
export type Power = "on" | "standby"
export type Input = "airplay" | "net_radio" | "line1" | "line2" | "tuner" | "bluetooth"
export interface YamahaEvent {
    main?: {
        volume?: number
        power?: Power
        input?: Input
    }
    device_id: string
}