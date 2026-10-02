FROM node:22-slim

WORKDIR /app

# Install pnpm (pinned to match the version in root package.json)
RUN npm install -g pnpm@11.9.0

# Copy workspace files. packages/app depends on @workspace/api and
# @workspace/database, and pnpm-workspace.yaml is `packages/*`, so every
# workspace package.json has to exist or `pnpm install --frozen-lockfile`
# skips or fails to link deps the Vite process later needs to resolve.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/database/package.json ./packages/database/
COPY packages/api/package.json ./packages/api/
COPY packages/app/package.json ./packages/app/
COPY packages/landing/package.json ./packages/landing/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source (compose bind-mounts overlay these for hot reload)
COPY packages/database ./packages/database
COPY packages/api ./packages/api
COPY packages/app ./packages/app

# Entrypoint re-runs pnpm install so stale anonymous node_modules volumes
# pick up packages added after the first `docker compose up`.
COPY packages/app/docker-entrypoint.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5173

ENTRYPOINT ["docker-entrypoint.sh"]
