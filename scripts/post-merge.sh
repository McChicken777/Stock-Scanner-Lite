#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
# Rebuild the api-server bundle so pulled route/schema changes actually run.
# dist/ is gitignored, so without this the server keeps serving stale compiled code.
pnpm --filter api-server build
echo "post-merge: api-server rebuilt — restart the server (Stop ▸ Run) to load the new bundle."
