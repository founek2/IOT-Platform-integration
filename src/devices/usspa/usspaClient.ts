import { res } from "https://deno.land/x/faster@v12.1/middlewares/parser.ts";

export enum Command {
    GetCommand = "GetCommand",
    GetTimeZone = "GetTimeZone",
    GetLastConn = "GetLastConn"
}

export enum SetCommand {
    SetPump1 = "SetPump1",
    SetPump2 = "SetPump2",
    SetPump3 = "SetPump3",
    SetReqTemp = "SetReqTemp",
    SetLight1 = "SetLight1",
}

export class UsspaClient {
    serialNumber: string;
    password: string

    constructor(serialNumber: string, password: string) {
        this.serialNumber = serialNumber;
        this.password = password;
    }

    private sendData(data: string) {
        return fetch("https://in.usspa.cz/app/", {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            method: "POST",
            body: new URLSearchParams({
                'data': data
            })
        })
    }

    private sendGetCommand(command: Command) {
        return this.sendData(`SN:${this.serialNumber};Cmd,${command}`)
    }

    private sendSetCommand(command: SetCommand, value: string) {
        return this.sendData(`SN:${this.serialNumber};Cmd,${command};${command.replace("Set", "")},${value}`)
    }

    private async setCommand(command: SetCommand, value: string): Promise<boolean> {
        const result = await this.sendSetCommand(command, value)
        return Boolean(result)
    }

    async sync() {
        const res = await this.sendGetCommand(Command.GetCommand)
        if (!res.ok) return;
        const data = this.parseResponse(await res.text())
        if (!data) return;

        const reqTemp = data.find(d => d[0] == 'ReqTemp')?.[1];
        const actualTemp = data.find(d => d[0] == 'ActTemp')?.[1];
        const filtration = data.find(d => d[0] == 'FiltrState')?.[1] as "0" | "1" | "2" | "3" | "4";
        const pump1 = data.find(d => d[0] == 'Pump1')?.[1] as "0" | "1" | "2";
        const pump2 = data.find(d => d[0] == 'Pump2')?.[1] as "0" | "1";
        const pump3 = data.find(d => d[0] == 'Pump3')?.[1] as "0" | "1";
        const light1 = data.find(d => d[0] == 'Light1')?.[1] as "0" | "1";
        const heater = data.find(d => d[0] == 'HeaterState')?.[1] as "0" | "1";
        const notifications = data.find(d => d[0] == 'Notifications')?.[1];

        return {
            reqTemp,
            actualTemp,
            filtration,
            pump1,
            pump2,
            pump3,
            light1,
            heater,
            notifications,
        };
    }

    async login() {
        try {
            const res = await this.sendData(`Login,${this.serialNumber},${this.password}`)
            const data = this.parseResponse(await res.text())
            return Boolean(data);
        } catch (_e) {
            return false;
        }
    }

    private parseResponse(data: string): ([cmd: string, value: string, date: string])[] | null {
        if (data.includes('ErrCode,1')) return null;
        const [error, ...commands] = data.split(';')

        return commands.map(c => c.split(',')) as any
    }

    setFiltration(state: boolean): Promise<boolean> {
        return this.setCommand(SetCommand.SetPump1, state ? "1" : "0")
    }

    async setNozzles(state: boolean): Promise<boolean> {
        if (state) {
            const result1 = await this.setCommand(SetCommand.SetPump1, "2")
            const result2 = await this.setCommand(SetCommand.SetPump2, "1")
            return result1 && result2;
        }
        else {
            const result2 = await this.setCommand(SetCommand.SetPump2, "0")
            const result1 = await this.setCommand(SetCommand.SetPump1, "0")
            return result1 && result2;
        }
    }

    setBubbles(state: boolean): Promise<boolean> {
        return this.setCommand(SetCommand.SetPump3, state ? "1" : "0");
    }

    setTempPreset(target: string): Promise<boolean> {
        return this.setCommand(SetCommand.SetReqTemp, target);
    }

    setLight(state: boolean): Promise<boolean> {
        return this.setCommand(SetCommand.SetLight1, state ? "1" : "0");
    }
};