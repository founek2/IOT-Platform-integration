FROM denoland/deno

RUN apt update && apt install -y pipx && apt clean && pipx install catt

WORKDIR /app

COPY ./ ./

# Run once to load all dependencies in modules
RUN deno run -A src/index.ts || true

CMD ["deno", "run", "-A", "--unsafely-ignore-certificate-errors", "src/index.ts", "--config", "/config.yaml"]