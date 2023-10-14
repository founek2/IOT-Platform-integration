import {
    CookieJar,
    wrapFetch,
} from "https://deno.land/x/another_cookiejar@v5.0.3/mod.ts";

export class UnifiClient {
    baseUrl: string
    user: string
    password: string
    fetch: typeof fetch
    cookieJar: CookieJar

    constructor(_baseUrl: string, _user: string, _password: string) {
        this.baseUrl = _baseUrl
        this.user = _user
        this.password = _password
        this.cookieJar = new CookieJar();
        this.fetch = wrapFetch({ cookieJar: this.cookieJar });
    }

    async login() {
        const res = await this.fetch(this.baseUrl + "/api/login", {
            headers: {
                referer: this.baseUrl + "/login",
                "content-type": "application/json",

            },
            method: "POST",
            body: JSON.stringify({
                username: this.user,
                password: this.password
            })
        })
        if (!res.ok) throw new Error("Failed to login")
    }

    async listActiveDevices() {
        const token = this.cookieJar.getCookie({ name: "csrf_token" });
        const res = await this.fetch(this.baseUrl + "/v2/api/site/default/clients/active", {
            method: "GET",
            headers: {
                referer: "https://192.168.10.217:8444/manage/default/clients",
                "X-Csrf-Token": token?.value || "",
                "content-type": "application/json"
            }
        })
        if (!res.ok) throw new Error("Failed to get active devices")

        const devices = await res.json() as UnifiDevice[]
        const activeDevices = devices.filter((d) => d.status === "online")

        return activeDevices
    }
}

export interface UnifiDevice {
    status: "online",
    id: string
    ip: string
    is_guest: boolean
    mac: string,
    user_id: string
}