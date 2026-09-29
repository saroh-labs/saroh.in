#!/bin/bash
# The local gate before a batch is pushed (docs/patterns/devops-tooling-and-deploy.md
# → Branches, batches and pull requests). It runs what CI runs, on this machine,
# so a failure costs minutes here instead of a push, five Vercel builds and a
# CI round trip. Every step here exists because CI once caught it first —
# docs/architecture/DEV_LEARNINGS.md has the stories.
#
#   pnpm prepush                 secrets, lint, types, checks, unit tests, vitest
#   pnpm prepush --int           … plus API integration tests, in module groups
#   pnpm prepush --e2e           … plus the browser specs for the screens this
#                                branch touched, on desk AND phone, against CI's
#                                seeded stack built from HEAD (E2E_DATABASE_URL)
#   pnpm prepush --all           everything
#
# Integration needs TEST_DATABASE_URL naming a database with "test" in it (and a
# changed migration needs REPLAY_DATABASE_URL, a throwaway one; the browser step
# needs E2E_DATABASE_URL, another), and
# PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION set for the reset. It never prints
# either. bash 3 compatible (macOS).
set -o pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

INT=0; E2E=0
for a in "$@"; do
    case "$a" in
        --int) INT=1 ;;
        --e2e) E2E=1 ;;
        --all) INT=1; E2E=1 ;;
        *) echo "unknown option $a"; exit 2 ;;
    esac
done

BASE=${PREPUSH_BASE:-origin/development}
git fetch -q origin development 2>/dev/null || true
LOG=$(mktemp -t prepush)
FAILED=""
step() {
    name=$1; shift
    printf '=== %-16s' "$name"
    if "$@" >"$LOG" 2>&1; then echo PASS; else
        echo FAIL; tail -40 "$LOG"; FAILED="$FAILED $name"
    fi
}
CHANGED=$(git diff --name-only "$BASE"...HEAD)

# 1. Secrets. The repo is public: a hit is a leak, not a lint.
if command -v gitleaks >/dev/null 2>&1; then
    step secrets gitleaks git . --redact --no-banner --exit-code 1 \
        --log-opts="$BASE..HEAD"
else
    echo "=== secrets         SKIP — install gitleaks (brew install gitleaks); CI runs it"
fi

# 2. Static checks and fast tests.
step lint pnpm run lint
step typecheck pnpm run typecheck
step routes pnpm run check:routes
step blocks pnpm run check:blocks
step cycles pnpm run check:cycles
# As CI: unit tests mock the environment, so its zod check is skipped.
step api-unit env SKIP_ENV_VALIDATION=1 pnpm --filter @saroh/api test:unit
step app-vitest pnpm --filter application test
step blocks-vitest pnpm --filter @saroh/site-blocks test
step sites-vitest pnpm --filter sites test
# A new migration must replay onto an empty database and match schema.prisma.
# REPLAY_DATABASE_URL names a throwaway database (its name must contain "test").
if echo "$CHANGED" | grep -q "^packages/database/prisma/"; then
    case "${REPLAY_DATABASE_URL:-}" in
        *test*)
            rdb=$(echo "$REPLAY_DATABASE_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')
            step db-replay env DATABASE_URL="$REPLAY_DATABASE_URL" \
                DATABASE_TARGET_CONFIRM="$rdb" \
                pnpm --filter @saroh/database db:verify:replay ;;
        *)
            echo "=== db-replay       SKIP — migrations changed: set REPLAY_DATABASE_URL to a throwaway *test* database"
            [ "$INT" = 1 ] && FAILED="$FAILED db-replay(unset)" ;;
    esac
fi

# 3. API integration, six modules at a time: one run over the whole suite can
# crash a jest worker. One database per run — two runs on one database reset
# each other's rows and fail at random.
if [ "$INT" = 1 ]; then
    case "${TEST_DATABASE_URL:-}" in
        *test*) ;;
        *) echo "TEST_DATABASE_URL must name a test database"; exit 1 ;;
    esac
    mods=(); while IFS= read -r m; do mods+=("$m"); done \
        < <(ls apps/api.saroh.in/src/modules)
    i=0
    while [ $i -lt ${#mods[@]} ]; do
        pat=$(IFS='|'; echo "${mods[*]:$i:6}")
        step "int:${mods[$i]}+" pnpm --filter @saroh/api test:int -- \
            --testPathPattern "src/modules/($pat)/"
        i=$((i + 6))
    done
    step "int:common" pnpm --filter @saroh/api test:int -- \
        --testPathPattern "src/(common|app)|test/"
fi

# 4. Browser specs for the screens this branch touched, on CI's stack.
#
# A mirror of CI's "Browser E2E (seeded stack)" job (.github/workflows/ci.yml,
# `browser-e2e-shard`), not of `pnpm dev`: a fresh database migrated and
# seeded with the showcase, production builds of the api, accounts, app and
# renderer on CI's bare ports, CI's placeholder env, and CI=1. Specs run
# against the long-lived saroh-dev failed 21 times on data drift in one run
# (DEV_LEARNINGS "23 local browser failures, none of them a bug").
#
# It builds and runs from its own detached worktree of HEAD (committed work
# only), so the `.next` of a running `pnpm dev` is never touched and no local
# `.env` leaks in — a runner has none either. The portless dev stack is left
# alone; if one of CI's ports is taken, the step says which and stops.
#
# Needs E2E_DATABASE_URL naming a throwaway database with "test" in its name.
# It is dropped and re-created each run. Server logs stay in $E2E_LOGS.
# A route folder or a component folder that changed picks every spec that
# names it. Both projects: the phone has its own bars, sheets and toasts.
e2e_stack() {
    set -e
    local url=$1 name=$2 dir=$3 specs=$4
    local maint
    maint=$(echo "$url" | sed -E 's#/[^/?]+(\?.*)?$#/postgres#')
    if [ -d "$dir/.git" ] || [ -f "$dir/.git" ]; then
        git -C "$dir" checkout -q --detach -f "$SHA"
    else
        git worktree add -q --detach -f "$dir" "$SHA"
    fi
    cd "$dir"
    echo "--- worktree $dir at $(git rev-parse --short HEAD)"
    pnpm install --frozen-lockfile --prefer-offline
    pnpm --filter @saroh/database generate

    # CI's job env, verbatim: placeholders that no live service accepts.
    export CI=1 SKIP_ENV_VALIDATION=1 PORT=3333
    export DATABASE_URL="$url" DATABASE_TARGET_CONFIRM="$name"
    export BETTER_AUTH_SECRET=ci-placeholder-secret-at-least-32-characters # gitleaks:allow (CI placeholder)
    export BETTER_AUTH_URL=http://localhost:3333
    export BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3003,http://localhost:3333
    export APP_URL=http://localhost:3003
    export NEXT_PUBLIC_ACCOUNTS_URL=http://localhost:3000
    export NEXT_PUBLIC_API_URL=http://localhost:3333
    export NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3333
    export NEXT_PUBLIC_APP_DOMAIN=app.saroh.in
    export NEXT_PUBLIC_ROOT_DOMAIN=localhost
    export EMAIL_FROM="Saroh <noreply@saroh.in>"
    export E2E_APP_URL=http://localhost:3003
    export E2E_ACCOUNTS_URL=http://localhost:3000
    export E2E_API_URL=http://localhost:3333
    export E2E_RENDERER_URL=http://localhost:3005
    export SITE_RELAY_SECRET=saroh-dev-insecure-site-relay-secret-not-for-production
    export SITE_ACCOUNTS_CODE_SECRET=ci-placeholder-site-code-secret-at-least-32-chars # gitleaks:allow (CI placeholder)
    export SITE_CODES_EMAIL_FAKE=log

    echo "--- fresh database"
    dropdb --if-exists --force --maintenance-db="$maint" "$name"
    createdb --maintenance-db="$maint" "$name"
    pnpm --filter @saroh/database db:migrate:deploy
    pnpm turbo run db:seed:showcase --filter=@saroh/database

    echo "--- build"
    pnpm turbo run build --filter=@saroh/api --filter=auth \
        --filter=application --filter=sites

    echo "--- start the stack (logs in $E2E_LOGS)"
    pnpm --filter @saroh/api start >"$E2E_LOGS/api.log" 2>&1 &
    pnpm --filter auth exec next start -p 3000 >"$E2E_LOGS/accounts.log" 2>&1 &
    pnpm --filter application exec next start -p 3003 >"$E2E_LOGS/app.log" 2>&1 &
    pnpm --filter sites exec next start -p 3005 >"$E2E_LOGS/renderer.log" 2>&1 &
    wait_up api http://localhost:3333/health "200 307"
    wait_up accounts http://localhost:3000/login "200 307"
    wait_up app http://localhost:3003/ "200 307"
    wait_up renderer http://localhost:3005/preview/not-a-token "200 307 404"

    echo "--- specs:$specs"
    cd e2e
    # shellcheck disable=SC2086
    pnpm exec playwright test $specs --project=desk --project=phone
}
wait_up() {
    local attempt code want
    for attempt in $(seq 1 90); do
        code=$(curl -s -o /dev/null -w '%{http_code}' "$2" || echo 000)
        for want in $3; do
            [ "$code" = "$want" ] && { echo "$1 is up ($code)"; return 0; }
        done
        sleep 2
    done
    echo "$1 never came up (last status $code) — see $E2E_LOGS/$1.log"
    return 1
}
stop_stack() {
    # The ports were free before the stack started, so whatever listens on
    # them now is ours.
    local p
    for p in 3333 3000 3003 3005; do
        lsof -nP -tiTCP:$p -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
    done
}
if [ "$E2E" = 1 ]; then
    keys=$(echo "$CHANGED" | sed -nE \
        -e 's#^apps/app\.saroh\.in/app/\(shell\)/([^/]+)/.*#\1#p' \
        -e 's#^apps/app\.saroh\.in/components/([^/]+)/.*#\1#p' \
        -e 's#^e2e/tests/([^/]+)\.spec\.ts$#\1#p' | sort -u)
    specs=""
    for k in $keys; do
        for f in $(grep -lE "/$k[/\"'?]|$k" e2e/tests/*.spec.ts 2>/dev/null); do
            case " $specs " in *" $f "*) ;; *) specs="$specs $f" ;; esac
        done
    done
    specs=$(echo "$specs" | sed 's#e2e/##g')
    e2e_db=$(echo "${E2E_DATABASE_URL:-}" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')
    busy=""
    for p in 3333 3000 3003 3005; do
        lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 && busy="$busy $p"
    done
    if [ -z "$specs" ]; then
        echo "=== e2e             no spec names a changed screen"
    elif [ -z "${E2E_DATABASE_URL:-}" ] || ! echo "$e2e_db" | grep -q test; then
        echo "=== e2e             FAIL — set E2E_DATABASE_URL to a throwaway *test* database (it is dropped and re-created)"
        FAILED="$FAILED e2e(db)"
    elif [ -n "$busy" ]; then
        echo "=== e2e             FAIL — CI's ports are taken:$busy (stop whatever listens there; the portless stack does not)"
        FAILED="$FAILED e2e(ports)"
    else
        [ -n "$(git status --porcelain)" ] && \
            echo "    (uncommitted changes are not in the run: it tests HEAD)"
        SHA=$(git rev-parse HEAD)
        E2E_DIR=${PREPUSH_E2E_DIR:-${TMPDIR:-/tmp}/saroh-prepush-e2e}
        E2E_LOGS=$(mktemp -d -t prepush-e2e-logs)
        echo "=== e2e specs:$specs"
        started=$(date +%s)
        trap stop_stack EXIT
        if (e2e_stack "$E2E_DATABASE_URL" "$e2e_db" "$E2E_DIR" "$specs") \
            >"$E2E_LOGS/run.log" 2>&1; then
            echo "=== e2e-desk-phone  PASS ($(( $(date +%s) - started ))s)"
        else
            echo "=== e2e-desk-phone  FAIL ($(( $(date +%s) - started ))s)"
            grep -E "✘|^\s+[0-9]+ (failed|passed|skipped|flaky)|never came up|Error:" \
                "$E2E_LOGS/run.log" | tail -40
            echo "    run log and server logs: $E2E_LOGS"
            FAILED="$FAILED e2e-desk-phone"
        fi
        stop_stack
        trap - EXIT
    fi
fi

rm -f "$LOG"
if [ -n "$FAILED" ]; then
    echo "FAILED:$FAILED"; exit 1
fi
echo "ALL PASS — push the batch."
