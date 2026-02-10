#!/bin/bash
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "[$(date)] Pulling latest changes..."
git pull origin main

echo "[$(date)] Installing dependencies..."
npm install --silent

echo "[$(date)] Building admin panel..."
cd admin && npm install --silent && npm run build && cd "$APP_DIR"

echo "[$(date)] Running migrations..."
npx prisma migrate deploy 2>&1 | tail -3
npx prisma generate --no-hints 2>/dev/null

echo "[$(date)] Restarting service..."
systemctl restart telegram-parser

echo "[$(date)] Update complete!"
