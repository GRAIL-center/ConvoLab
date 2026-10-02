#!/bin/sh
set -e

# compose.yml mounts anonymous volumes over /app/node_modules and
# /app/packages/app/node_modules so the host's node_modules don't clobber
# the image. Those volumes persist across rebuilds, which is why a package
# that exists in package.json (react-google-recaptcha) can still be missing
# at runtime. Reinstall into the volumes from the lockfile before Vite starts.
echo "Syncing workspace dependencies into container volumes..."
pnpm install --frozen-lockfile

echo "Starting Vite dev server..."
exec pnpm -F @workspace/app dev --host
