FROM denoland/deno

ENV PATH="${PATH}:/root/.local/bin"

RUN apt update && apt install -y pipx && apt clean && pipx install catt

WORKDIR /app

COPY ./ ./

# Run once to load all dependencies in modules
RUN deno run -A src/index.ts || true

CMD ["deno", "run", "-A", "--unstable-net", "--unsafely-ignore-certificate-errors", "src/index.ts", "--config", "/config.yaml"]