FROM node:22-slim AS node

FROM eclipse-temurin:21-jre

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

RUN npm install -g firebase-tools@15.26.0

# The emulator downloads this JAR on first start, and when that download fails
# the container exits before the API can seed anything. Put it in the image
# instead. The trailing * makes the COPY a no-op when the local cache is empty,
# in which case we fetch it here at build time.
ARG FIRESTORE_EMULATOR_VERSION=1.22.0
COPY docker/emulator-cache/cloud-firestore-emulator-v${FIRESTORE_EMULATOR_VERSION}.jar* /tmp/emulator-cache/
RUN set -eu; \
  target="/root/.cache/firebase/emulators/cloud-firestore-emulator-v${FIRESTORE_EMULATOR_VERSION}.jar"; \
  cached="/tmp/emulator-cache/cloud-firestore-emulator-v${FIRESTORE_EMULATOR_VERSION}.jar"; \
  mkdir -p /root/.cache/firebase/emulators; \
  if [ -s "$cached" ]; then \
    cp "$cached" "$target"; \
  else \
    apt-get update -y; \
    apt-get install -y --no-install-recommends curl ca-certificates; \
    curl -fsSL --retry 5 --retry-delay 2 -o "$target" \
      "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v${FIRESTORE_EMULATOR_VERSION}.jar"; \
    apt-get purge -y curl; \
    rm -rf /var/lib/apt/lists/*; \
  fi; \
  rm -rf /tmp/emulator-cache; \
  test -s "$target"

WORKDIR /workspace

COPY firebase.json firestore.indexes.json firestore.rules ./
