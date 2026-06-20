#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
# Rebuild the api-server bundle so pulled route/schema changes actually run.
# dist/ is gitignored, so without this the server keeps serving stale compiled code.
pnpm --filter api-server build
# Rebuild the warehouse frontend too — otherwise the phone/web UI stays on the old
# build (wrong layout, missing features). This is what serves the actual app.
pnpm --filter warehouse build
echo "post-merge: api-server + frontend rebuilt — restart (Stop ▸ Run) to load the new build."
