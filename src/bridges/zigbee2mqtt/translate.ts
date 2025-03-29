import { Logger } from "https://raw.githubusercontent.com/founek2/IOT-Platform-deno/master/src/mod.ts";
import * as deepl from 'npm:deepl-node';

let translator: deepl.Translator

function getTranslator(apiKey: string) {
    if (!translator) {
        translator = new deepl.Translator(apiKey)
    }
    return translator;
}


export async function translate(text: string, logger: Logger, deeplApiKey?: string): Promise<string> {
    if (!deeplApiKey) return text;

    if (text.toLowerCase() === "linkquality") return "Síla signálu";
    if (text.toLowerCase() === "state") return "Stav";

    try {
        const translated = await getTranslator(deeplApiKey).translateText(text.replace(/_/g, " "), "en", "cs");

        return translated.text;
    } catch (err) {
        logger.warning(err)
        return text;
    }
}