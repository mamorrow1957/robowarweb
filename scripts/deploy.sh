#!/bin/bash
set -euo pipefail

REPO_DIR=~/robowarweb
DEPLOY_DIR=/var/www/robowarweb/dist
API_PORT=3001

echo "=== Pulling latest code ==="
cd "$REPO_DIR"
git pull

echo "=== Installing dependencies ==="
npm ci

echo "=== Building frontend ==="
npm run build

echo "=== Backing up current deployment ==="
if sudo test -d "$DEPLOY_DIR"; then
  backup="/var/www/robowarweb.backup.$(date +%Y%m%d_%H%M%S)"
  sudo cp -a "$DEPLOY_DIR" "${backup}"
  echo "Backup saved to ${backup}"
fi

echo "=== Deploying frontend to ${DEPLOY_DIR} ==="
sudo rsync -av --delete "$REPO_DIR/dist/" "$DEPLOY_DIR/"

echo "=== Restarting API server ==="
if command -v pm2 &>/dev/null && pm2 list | grep -q robowar; then
  echo "Using PM2..."
  pm2 restart robowar
elif command -v pm2 &>/dev/null && pm2 list | grep -q api; then
  echo "Using PM2 (api process)..."
  pm2 restart api
elif sudo systemctl list-units --type=service | grep -q robowar; then
  echo "Using systemd..."
  sudo systemctl restart robowar
else
  echo "Restarting Node process on port ${API_PORT}..."
  OLD_PID=$(lsof -ti tcp:${API_PORT} 2>/dev/null || true)
  if [ -n "$OLD_PID" ]; then
    kill "$OLD_PID"
    sleep 1
    echo "Killed old process (PID ${OLD_PID})"
  fi
  nohup node "$REPO_DIR/api/server.js" >> /var/log/robowar-api.log 2>&1 &
  echo "API started (PID $!), logging to /var/log/robowar-api.log"
fi

echo "=== Deploy complete ==="
