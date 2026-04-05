#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Ensure data directory exists for bind-mount volume
mkdir -p "$ROOT_DIR/data"

echo "==> Building and starting Docker Compose services..."
docker compose up -d --build

echo "==> Waiting for backend healthcheck..."
RETRIES=30
until docker compose exec -T kraken-backend wget -qO- http://localhost:8080/healthz > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then
    echo "ERROR: backend did not become healthy in time" >&2
    docker compose logs kraken-backend
    exit 1
  fi
  echo "  waiting... ($RETRIES attempts left)"
  sleep 2
done

echo ""
echo "==> Services are up:"
echo "    Frontend : http://localhost:3000"
echo "    Backend  : http://localhost:8080"
echo "    API      : http://localhost:8080/api/v1"
echo ""
echo "==> Useful commands:"
echo "    docker compose logs -f              # follow all logs"
echo "    docker compose logs -f kraken-backend  # backend logs only"
echo "    docker compose down                 # stop all services"
