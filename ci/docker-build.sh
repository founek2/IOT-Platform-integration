
#!/usr/bin/env bash
set -e

name="docker-registry-write.iotdomu.cz/iot-platform/integration"
hash=$(git rev-parse --short HEAD)

docker buildx create --use 
docker buildx build --platform linux/amd64,linux/arm64  -t $name:$hash -t $name:latest --progress plain .

docker push $name:$hash
docker push $name:latest