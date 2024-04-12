import translateDeepl from "npm:translate";

export function translate(text: string, deeplApiKey?: string): string | Promise<string> {
    if (!deeplApiKey) return text;

    if (text.toLowerCase() === "linkquality") return "Síla signálu";
    if (text.toLowerCase() === "state") return "Stav";

    /** @ts-ignore */
    translateDeepl.engine = "deepl";
    /** @ts-ignore */
    translateDeepl.key = deeplApiKey;

    return translateDeepl(text.replace(/_/g, " "), {
        to: "cs",
        from: "en"
    });
}