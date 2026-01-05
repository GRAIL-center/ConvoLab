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

# Generate Prisma Client and build database package
RUN pnpm -F @workspace/database generate
RUN pnpm -F @workspace/database build

# Expose port
EXPOSE 3000

# Start development server
CMD ["pnpm", "-F", "@workspace/api", "dev:docker"]
