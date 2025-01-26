import { Logger } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts";
import translateDeepl from "npm:translate";

export async function translate(text: string, logger: Logger, deeplApiKey?: string): Promise<string> {
    if (!deeplApiKey) return text;

    if (text.toLowerCase() === "linkquality") return "Síla signálu";
    if (text.toLowerCase() === "state") return "Stav";

    /** @ts-ignore */
    translateDeepl.engine = "deepl";
    /** @ts-ignore */
    translateDeepl.key = deeplApiKey;

    try {
        const translated = await translateDeepl(text.replace(/_/g, " "), {
            to: "cs",
            from: "en"
        });

        return translated;
    } catch (err) {
        logger.warning(err)
        return text;
    }
}