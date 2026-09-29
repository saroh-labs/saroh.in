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
#                                branch touched, on desk AND phone (stack running)
#   pnpm prepush --all           everything
#
# Integration needs TEST_DATABASE_URL naming a database with "test" in it (and a
# changed migration needs REPLAY_DATABASE_URL, a throwaway one), and
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

# 4. Browser specs for the screens this branch touched. A route folder or a
# component folder that changed picks every spec that names it. Both projects:
# the phone has its own bars, sheets and toasts, and fails on its own.
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
    if [ -z "$specs" ]; then
        echo "=== e2e             no spec names a changed screen"
    else
        echo "=== e2e specs:$specs"
        rel=$(echo "$specs" | sed 's#e2e/##g')
        step e2e-desk-phone env E2E_IGNORE_HTTPS_ERRORS=1 \
            pnpm --filter @saroh/e2e exec playwright test $rel \
            --project=desk --project=phone
    fi
fi

rm -f "$LOG"
if [ -n "$FAILED" ]; then
    echo "FAILED:$FAILED"; exit 1
fi
echo "ALL PASS — push the batch."
