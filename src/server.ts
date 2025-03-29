import { res, Server, Context, NextFunc } from "https://deno.land/x/faster/mod.ts";
import { FactoryReturn } from "./types.ts";

export async function startHealthcheckServer(instances: FactoryReturn[]) {
    const server = new Server();
    server.get(
        "/api/devices/health",
        res("json"),
        async (ctx: Context, next: NextFunc) => {
            const checks = instances.map((plat) => {
                const health = plat.healthCheck()
                if (Array.isArray(health)) {
                    return health
                } else return [health]
            }).flat();

            ctx.res.body = checks;
            ctx.res.status = checks.some(c => !c.connected) ? 503 : 200;
            await next();
        },
    );

    await server.listen({ port: Number(Deno.env.get('PORT') || '8080') });
}