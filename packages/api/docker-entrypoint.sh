#!/bin/sh
set -e

echo "Building @workspace/database package..."
pnpm -F @workspace/database generate
pnpm -F @workspace/database build

echo "Starting API server..."
exec pnpm -F @workspace/api dev:docker
