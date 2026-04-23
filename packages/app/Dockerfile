FROM node:22-slim

WORKDIR /app

# Install pnpm (pinned to match pnpm-lock.yaml version)
RUN npm install -g pnpm@10.28.2

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/database/package.json ./packages/database/
COPY packages/app/package.json ./packages/app/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/database ./packages/database
COPY packages/app ./packages/app

# Expose port
EXPOSE 5173

# Start development server
CMD ["pnpm", "-F", "@workspace/app", "dev", "--host"]
