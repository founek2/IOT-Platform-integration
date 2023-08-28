FROM denoland/deno

WORKDIR /app

COPY ./ ./
RUN deno cache src/bots/bravia.ts
RUN deno check src/bots/bravia.ts

RUN deno cache src/bots/light.ts
RUN deno check src/bots/light.ts

RUN deno cache src/bots/meteo.ts
RUN deno check src/bots/meteo.ts

RUN deno cache src/bots/rgb-segments.ts
RUN deno check src/bots/rgb-segments.ts

RUN deno cache src/bots/rgb.ts
RUN deno check src/bots/rgb.ts

RUN deno cache src/bots/solax.ts
RUN deno check src/bots/solax.ts

RUN deno cache src/bots/spa.ts
RUN deno check src/bots/spa.ts

RUN deno cache src/bots/system.ts
RUN deno check src/bots/system.ts