#!/usr/bin/env bash
# Prefetch the Firestore emulator JAR into docker/emulator-cache/, where the
# emulator image picks it up at build time instead of downloading it.
# Optional: the image build fetches the JAR itself when the cache is empty.
# Worth running if a build fails with:
#   Failed to make request to .../cloud-firestore-emulator-v*.jar
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${FIRESTORE_EMULATOR_VERSION:-1.22.0}"
DEST="$ROOT/docker/emulator-cache/cloud-firestore-emulator-v${VERSION}.jar"
URL="https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v${VERSION}.jar"
mkdir -p "$(dirname "$DEST")"
if [ -s "$DEST" ]; then
  echo "Already present: $DEST"
  exit 0
fi
echo "Downloading $URL"
curl -fL --retry 5 --retry-delay 2 -o "$DEST" "$URL"
ls -lh "$DEST"
