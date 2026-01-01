FROM node:22-slim

WORKDIR /app

# Install system dependencies (OpenSSL for Prisma)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/database/package.json ./packages/database/
COPY packages/api/package.json ./packages/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/database ./packages/database
COPY packages/api ./packages/api

# Generate Prisma Client
RUN pnpm -F @workspace/database generate

# Expose port
EXPOSE 3000

# Start development server
CMD ["pnpm", "-F", "@workspace/api", "dev:docker"]
