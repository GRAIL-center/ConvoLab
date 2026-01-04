#!/bin/bash
# Lightweight GitOps deploy script
# Run via cron: */5 * * * * /path/to/ai-dialogues/deploy.sh >> /path/to/deploy.log 2>&1

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BRANCH="${DEPLOY_BRANCH:-main}"
COMPOSE_FILE="compose.prod.yml"
ENV_FILE=".env.prod"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Check if .env.prod exists
if [ ! -f "$ENV_FILE" ]; then
    log "ERROR: $ENV_FILE not found. Copy .env.prod.example and configure it."
    exit 1
fi

# Fetch latest changes
git fetch origin "$BRANCH" --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    # No changes, exit silently (don't spam logs)
    exit 0
fi

log "Changes detected: $LOCAL -> $REMOTE"
log "Resetting to match origin/$BRANCH..."

# Use reset --hard to avoid merge conflicts (this is a deploy target, not dev)
git reset --hard "origin/$BRANCH"

log "Building and deploying..."

# Load env file and run compose
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

log "Cleaning up old images..."
docker image prune -f

log "Deploy complete!"

# Show running containers
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
