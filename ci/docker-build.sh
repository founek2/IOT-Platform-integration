
#!/usr/bin/env bash
set -e

name="docker-registry-write.iotdomu.cz/iot-platform/integration"
hash=$(git rev-parse --short HEAD)

docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64  -t $name:$hash -t $name:latest --push --cache-from="$name:cache" --cache-to="$name:cache" --progress plain .