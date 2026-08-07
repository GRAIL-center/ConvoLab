#!/usr/bin/env bash
# Long-running synthetic conversation generator for DQI practice data.
#
# Two lanes, both writing one JSONL file per conversation into OUT_DIR:
#   free lane  (conv-*.jsonl)  — Gemini free tier, one model per role (each
#                                role gets its own ~20 req/day quota bucket);
#                                backs off 4h when a bucket empties.
#   haiku lane (haiku-*.jsonl) — all-Anthropic Haiku 4.5, ~$0.05/conversation,
#                                capped at HAIKU_PER_DAY (default 20 ≈ $1/day).
#
# Usage:
#   nohup scripts/synthetic-batch.sh >/dev/null 2>&1 &
#   tail -f ~/convolab-synthetic/generator.log
# Stop:
#   pkill -f synthetic-batch.sh
# After a reboot, just start it again with the same nohup command.

set -u
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$HOME/convolab-synthetic}"
LOG="$OUT_DIR/generator.log"
HAIKU_PER_DAY="${HAIKU_PER_DAY:-50}"
HAIKU_MODEL="anthropic:claude-haiku-4-5-20251001"
mkdir -p "$OUT_DIR"
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
export FIRESTORE_EMULATOR_HOST=localhost:8080

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
    log "emulator failed to start"
    return 1
  fi
}

run_conv() { # $1 out-file, then model args...
  local out="$1"; shift
  local turns=$((RANDOM % 4 + 5)) # 5-8 turns for variety
  if (cd "$REPO_ROOT" && pnpm -F @workspace/api synthetic -- \
      --turns "$turns" "$@" --out "$out" >> "$OUT_DIR/runs.log" 2>&1) \
      && [ -s "$out" ]; then
    return 0
  fi
  rm -f "$out"
  return 1
}

haiku_today() { ls "$OUT_DIR"/haiku-"$(date +%Y%m%d)"-*.jsonl 2>/dev/null | wc -l | tr -d ' '; }

free_backoff_until=0
log "generator started (output: $OUT_DIR, haiku cap: $HAIKU_PER_DAY/day)"

while true; do
  if ! ensure_emulator; then sleep 600; continue; fi
  now=$(date +%s)

  # --- free Gemini lane ---
  if [ "$now" -ge "$free_backoff_until" ]; then
    ts=$(date +%Y%m%d-%H%M%S)
    log "free lane: generating conv-$ts"
    if LAPP_SCORER_MODEL=google:gemini-2.5-flash run_conv "$OUT_DIR/conv-$ts.jsonl" \
        --pace-seconds 30 \
        --user-model google:gemini-3-flash-preview \
        --partner-model google:gemini-3.6-flash \
        --coach-model google:gemini-3.1-flash-lite; then
      log "free lane: OK conv-$ts"
    else
      free_backoff_until=$(( $(date +%s) + 14400 ))
      log "free lane: failed (likely daily quota) — backing off 4h"
    fi
  fi

  # --- paid Haiku lane (~\$0.05/conversation, capped per day) ---
  if [ "$(haiku_today)" -lt "$HAIKU_PER_DAY" ]; then
    ts=$(date +%Y%m%d)-$(date +%H%M%S)
    log "haiku lane: generating haiku-$ts ($(haiku_today))"
    if LAPP_SCORER_MODEL="$HAIKU_MODEL" run_conv "$OUT_DIR/haiku-$ts.jsonl" \
        --user-model "$HAIKU_MODEL" \
        --partner-model "$HAIKU_MODEL" \
        --coach-model "$HAIKU_MODEL"; then
      log "haiku lane: OK haiku-$ts ($(haiku_today))/$HAIKU_PER_DAY today)"
    else
      log "haiku lane: failed — retrying next cycle"
    fi
  fi

  n=$(ls "$OUT_DIR"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')
  log "cycle done ($n conversations total); sleeping 15m"
  sleep 900
done
