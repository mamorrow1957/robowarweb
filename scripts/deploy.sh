#!/bin/bash
set -euo pipefail

REPO_DIR=~/robowarweb

echo "=== Pulling latest code ==="
cd "$REPO_DIR"
git pull

echo "=== Installing dependencies ==="
npm ci

echo "=== Building frontend ==="
npm run build

echo "=== Backing up current deployment ==="
if sudo test -d /var/www/robowarweb/dist; then
  backup="/var/www/robowarweb.backup.$(date +%Y%m%d_%H%M%S)"
  sudo cp -a /var/www/robowarweb/dist "${backup}"
  echo "Backup saved to ${backup}"
fi

echo "=== Deploying frontend ==="
sudo rsync -av --delete "$REPO_DIR/dist/" /var/www/robowarweb/dist/

echo "=== Restarting API server ==="
sudo systemctl restart robowar-api
sudo systemctl status robowar-api --no-pager

echo "=== Deploy complete ==="
