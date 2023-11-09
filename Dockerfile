FROM denoland/deno

ENV PATH="${PATH}:/root/.local/bin"

RUN apt update && apt install -y python3-pip && apt clean && pip3 install catt

WORKDIR /app

COPY ./ ./

# Run once to load all dependencies in modules
RUN deno run -A src/index.ts || true

CMD ["deno", "run", "-A", "--unsafely-ignore-certificate-errors", "src/index.ts", "--config", "/config.yaml"]