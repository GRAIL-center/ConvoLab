FROM node:20-slim

WORKDIR /app

# Install system dependencies (OpenSSL for Prisma)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Copy workspace config and all package sources (needed for proper workspace linking)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/database ./packages/database
COPY packages/api ./packages/api

# Install dependencies (workspace packages will be properly linked)
RUN pnpm install --frozen-lockfile

# Copy entrypoint script
COPY packages/api/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Entrypoint builds database package (after volume mount) then starts server
ENTRYPOINT ["docker-entrypoint.sh"]
