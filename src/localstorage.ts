import { ILocalStorage } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/storage.ts";

export class LocalStorage implements ILocalStorage {
    private path: string;

    constructor(path: string) {
        this.path = path;
    }

    private getFilePath(key: string) {
        return `${this.path}/${key}`;
    }

    getItem(key: string): string | null {
        try {
            return Deno.readTextFileSync(this.getFilePath(key));
        } catch (_err) {
            return null;
        }
    }
    removeItem(key: string): void {
        try {
            Deno.removeSync(this.getFilePath(key))
        } catch (err) {
            console.error("failed to remove " + this.getFilePath(key))
        }
    }
    setItem(key: string, value: string): void {
        Deno.writeTextFileSync(this.getFilePath(key), value);
    }
}