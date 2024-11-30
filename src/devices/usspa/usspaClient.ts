export enum Command {
    GetCommand = "GetCommand",
    GetTimeZone = "GetTimeZone",
    GetLastConn = "GetLastConn"
}

export class UsspaClient {
    serialNumber: string;

    constructor(serialNumber: string) {
        this.serialNumber = serialNumber;
    }

    sendCommand(command: Command) {
        return fetch("https://in.usspa.cz/app/", {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            method: "POST",
            body: new URLSearchParams({
                'data': `SN:${this.serialNumber};Cmd,${command}`
            })
        })
    }

    async sync() {
        const res = await this.sendCommand(Command.GetCommand)
        if (!res.ok) return;
        const data = this.parseResponse(await res.text())
        if (!data) return;

        const reqTemp = data.find(d => d[0] == 'ReqTemp')?.[1];
        const actualTemp = data.find(d => d[0] == 'ActTemp')?.[1];
        const filtration = data.find(d => d[0] == 'Filtration')?.[1] as "0" | "1";
        const pump1 = data.find(d => d[0] == 'Pump1')?.[1] as "0" | "1" | "2";
        const pump2 = data.find(d => d[0] == 'Pump2')?.[1] as "0" | "1";
        const pump3 = data.find(d => d[0] == 'Pump3')?.[1] as "0" | "1";
        const light1 = data.find(d => d[0] == 'Light1')?.[1] as "0" | "1";
        const notifications = data.find(d => d[0] == 'Notifications')?.[1];

        return {
            reqTemp,
            actualTemp,
            filtration,
            pump1,
            pump2,
            pump3,
            light1,
            notifications
        };
    }

    parseResponse(data: string): ([cmd: string, value: string, date: string])[] | null {
        if (data.includes('ErrCode,1')) return null;
        const [error, ...commands] = data.split(';')

        return commands.map(c => c.split(',')) as any
    }
};