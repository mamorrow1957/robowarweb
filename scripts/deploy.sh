#!/bin/bash
set -euo pipefail

echo "Building robowarweb..."
cd ~/robowarweb
npm ci
npm run build

echo "Backing up current deployment..."
if sudo test -d /var/www/robowarweb/dist; then
  backup="/var/www/robowarweb.backup.$(date +%Y%m%d_%H%M%S)"
  sudo cp -a /var/www/robowarweb/dist "${backup}"
  echo "Backup saved to ${backup}"
fi

echo "Deploying to /var/www/robowarweb/dist..."
sudo rsync -av --delete \
  ~/robowarweb/dist/ /var/www/robowarweb/dist/
echo "Deploy complete."
