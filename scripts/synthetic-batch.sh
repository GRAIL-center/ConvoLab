#!/usr/bin/env bash
# Long-running free-tier synthetic conversation generator for DQI practice data.
#
# Loops conversations through the synthetic CLI (all roles on gemini-2.5-flash,
# paced for the free tier) until the daily free quota runs out, backs off, and
# resumes. Each conversation lands as its own JSONL file in OUT_DIR, so data
# survives emulator or machine restarts.
#
# Usage:
#   nohup scripts/synthetic-batch.sh >/dev/null 2>&1 &
#   tail -f ~/convolab-synthetic/generator.log
#
# Stop it:
#   pkill -f synthetic-batch.sh
#
# If the Mac reboots, just start it again with the same nohup command.

set -u
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$HOME/convolab-synthetic}"
LOG="$OUT_DIR/generator.log"
mkdir -p "$OUT_DIR"
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
export FIRESTORE_EMULATOR_HOST=localhost:8080
export LAPP_SCORER_MODEL=google:gemini-2.5-flash

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

ensure_emulator() {
  if ! nc -z localhost 8080 2>/dev/null; then
    log "starting firestore emulator"
    (cd "$REPO_ROOT" && nohup firebase emulators:start --only firestore \
      >> "$OUT_DIR/emulator.log" 2>&1 &)
    for _ in $(seq 1 30); do
      nc -z localhost 8080 2>/dev/null && return 0
      sleep 2
    done
    log "emulator failed to start; retrying in 10m"
    return 1
  fi
}

log "generator started (output: $OUT_DIR)"
while true; do
  if ! ensure_emulator; then
    sleep 600
    continue
  fi

  turns=$((RANDOM % 4 + 5))  # 5-8 turns for variety
  ts=$(date +%Y%m%d-%H%M%S)
  out="$OUT_DIR/conv-$ts.jsonl"
  log "generating conv-$ts ($turns turns)"

  if (cd "$REPO_ROOT" && pnpm -F @workspace/api synthetic -- \
      --turns "$turns" --pace-seconds 60 \
      --user-model google:gemini-2.5-flash \
      --partner-model google:gemini-2.5-flash \
      --coach-model google:gemini-2.5-flash \
      --out "$out" >> "$OUT_DIR/runs.log" 2>&1); then
    n=$(ls "$OUT_DIR"/conv-*.jsonl 2>/dev/null | wc -l | tr -d ' ')
    log "OK conv-$ts ($n total)"
    sleep 120
  else
    log "run failed (likely daily quota) — backing off 4h"
    rm -f "$out"
    sleep 14400
  fi
done
