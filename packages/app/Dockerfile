FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/database/package.json ./packages/database/
COPY packages/app/package.json ./packages/app/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/database ./packages/database
COPY packages/app ./packages/app

# Generate Prisma Client
RUN pnpm -F @workspace/database generate

# Expose port
EXPOSE 5173

# Start development server
CMD ["pnpm", "-F", "@workspace/app", "dev", "--host"]
