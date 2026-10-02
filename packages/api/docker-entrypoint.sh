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
  ready=0
  i=0
  while [ "$i" -lt 90 ]; do
    if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      ready=1
      break
    fi
    i=$((i + 1))
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    echo "Firestore emulator never became reachable at ${FIRESTORE_EMULATOR_HOST}."
    echo "Skipping seed; check the firestore-emulator container logs (often a JAR download failure)."
  else
    # Brief settle: port can open before the emulator accepts gRPC.
    sleep 2
    echo "Seeding emulator reference data (idempotent upserts)..."
    pnpm -F @workspace/database seed || echo "Seed step failed; API will still start."
  fi
fi

echo "Starting API server..."
exec pnpm -F @workspace/api dev:docker
