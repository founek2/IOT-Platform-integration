FROM denoland/deno:2.5.3

ENV PATH="${PATH}:/root/.local/bin"

# Ping is required for tizen
RUN apt update && apt install -y pipx inetutils-ping && apt clean && pipx install catt

WORKDIR /app

COPY ./ ./

# Run once to load all dependencies in modules
RUN deno run -A src/index.ts || true

# --unstable-fs is required for localStorage package
CMD ["deno", "run", "-A", "--unstable-net", "--unstable-fs", "--unsafely-ignore-certificate-errors", "src/index.ts", "--config", "/config.yaml"]