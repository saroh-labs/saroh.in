#!/usr/bin/env bash
# Builds accounts for Cloudflare (OpenNext) and serves it in the Workers
# runtime (`wrangler dev`, local only: no Cloudflare login, no account), then
# asks for the sign-in pages. Fails on anything but a 200, or on a 5xx or an
# OpenNext "Unexpected loadManifest" in the Worker's log.
#
# `next build`, the unit tests and the browser specs all run Next under Node,
# never in workerd, so a Next.js and OpenNext pair that can't run together
# passes all of them. Next 16.4.2 with OpenNext 1.20.9 did: every page on
# every Worker returned 500 for 50 minutes on 23 Oct 2026 (DEV_LEARNINGS).
#
#   bash scripts/check-cf-runtime.sh
#
# CI's "Cloudflare runtime (accounts sign-in)" job and `pnpm prepush` run it
# when the lockfile, the workspace file, an app's package.json or an app's
# Next, OpenNext or wrangler config changes (CF_RUNTIME_RE in prepush.sh).
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
app="$root/apps/accounts.saroh.in"
port="${CF_RUNTIME_PORT:-8799}"
pages=(/login /signup /forgot-password)
log=$(mktemp "${TMPDIR:-/tmp}/cf-runtime.XXXXXX")

# Built as the dev deploy builds it (deploy-frontends.yml: cf-env.mjs). The
# dev build insists on an access key; a placeholder satisfies next.config and
# reaches no Worker (the runtime reads wrangler.jsonc's vars, which have none,
# so the key gate stays off and the pages answer).
set -a
eval "$(node "$root/scripts/cf-env.mjs" "$app" development | grep -v '^LAUNCH_DEPLOY_VARS=')"
set +a
export DEV_ACCESS_KEY=ci-placeholder-not-a-secret NEXT_TELEMETRY_DISABLED=1

(cd "$root" && pnpm turbo run build --filter='auth^...')
(cd "$app" && pnpm cf:build)

# A local .env must not stand in for what CI has; no login, no metrics.
(cd "$app" && env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u DEV_ACCESS_KEY \
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false WRANGLER_SEND_METRICS=false \
    pnpm exec wrangler dev --ip 127.0.0.1 --port "$port" >"$log" 2>&1) &
wrangler=$!
trap 'pkill -P $wrangler 2>/dev/null; kill $wrangler 2>/dev/null; pkill -f "wrangler dev --ip 127.0.0.1 --port $port" 2>/dev/null; rm -f "$log"' EXIT

ready=""
for _ in $(seq 1 90); do
    if grep -q "Ready on" "$log"; then ready=1; break; fi
    kill -0 $wrangler 2>/dev/null || break
    sleep 1
done
if [ -z "$ready" ]; then
    cat "$log"
    echo "::error::wrangler dev did not start"
    exit 1
fi

failed=0
for page in "${pages[@]}"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 60 "http://127.0.0.1:$port$page" || echo 000)
    echo "$page $code"
    [ "$code" = 200 ] || failed=1
done

if grep -E 'Unexpected loadManifest|(GET|HEAD|POST) [^ ]+ 5[0-9][0-9]' "$log" >/dev/null; then
    failed=1
fi
if [ "$failed" = 1 ]; then
    cat "$log"
    echo "::error::accounts' sign-in pages fail in the Workers runtime (a Next.js and OpenNext mismatch?)"
    exit 1
fi
echo "accounts' sign-in pages answer 200 in the Workers runtime"
