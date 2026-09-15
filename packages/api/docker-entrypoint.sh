#!/bin/sh
set -e

echo "Building @workspace/database package..."
pnpm -F @workspace/database generate
pnpm -F @workspace/database build

# B23: compose can start the API before the emulator is ready, or
# isDatabaseEmpty() can miss an empty emulator. Seed explicitly when
# pointed at the emulator so /practice and the scenario picker have data
# without a manual follow-up command.
if [ -n "${FIRESTORE_EMULATOR_HOST:-}" ]; then
  echo "Waiting for Firestore emulator at ${FIRESTORE_EMULATOR_HOST}..."
  host="${FIRESTORE_EMULATOR_HOST%:*}"
  port="${FIRESTORE_EMULATOR_HOST##*:}"
  i=0
  while [ "$i" -lt 30 ]; do
    if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      break
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "Seeding emulator reference data (idempotent upserts)..."
  pnpm -F @workspace/database seed || echo "Seed step failed; API will still start."
fi

echo "Starting API server..."
exec pnpm -F @workspace/api dev:docker
