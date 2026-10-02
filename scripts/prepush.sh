#!/bin/bash
# The local gate before a batch is pushed (docs/patterns/devops-tooling-and-deploy.md
# → Branches, batches and pull requests). It runs what CI runs, on this machine,
# so a failure costs minutes here instead of a push, five Vercel builds and a
# CI round trip. Every step here exists because CI once caught it first —
# docs/architecture/DEV_LEARNINGS.md has the stories.
#
#   pnpm prepush                 secrets, lint, types, checks, and the unit
#                                tests and vitest specs the branch's changes
#                                reach (what .husky/pre-push runs)
#   pnpm prepush --int           … plus the full unit suites and the API
#                                integration specs the branch's changes reach
#                                (jest --findRelatedTests, plus an always-run
#                                set), in groups, on parallel test databases,
#                                then the same specs again under RLS
#                                (TEST_RLS=on), as CI's two matrix modes
#   pnpm prepush --e2e           … plus the browser specs that cover what the
#                                branch changed (scripts/e2e-affected.mjs), on
#                                desk AND phone, against CI's seeded stack
#                                built from HEAD (E2E_DATABASE_URL), then the
#                                permission-state specs they reach on the
#                                app's production build (CI's "Permission
#                                states (production build)")
#   pnpm prepush --all           --int and --e2e; the browser step runs
#                                alongside the integration groups
#   … --full                     the WHOLE integration suite and every browser
#                                spec (alone: --all --full). CI always does.
#   … --no-cache                 run every step, even ones already passed on
#                                this tree, and bypass turbo's cache
#
# Fast because nothing runs twice:
#   - A step that passes is recorded against the tree it passed on
#     (`git rev-parse HEAD^{tree}`, only when no tracked file is modified), in
#     <git common dir>/prepush-cache/<tree>-<step>. The next run on that tree
#     prints "=== lint PASS (cached)". Per step, so --int reuses the quick
#     steps' passes, and a full unit pass stands in for a changed-only one.
#     Secrets are never cached: a leak lives in history, not in the tree. A
#     tree that differs from a passed one only in docs/ or *.md has passed too.
#   - lint, typecheck, the api's unit tests and every vitest suite run through
#     turbo, for the packages changed since BASE (origin/development) and their
#     dependents — CI's `...[base]` filter — with turbo's local cache (turbo
#     already shares one cache between a checkout and its worktrees).
#   - The quick run tests only what the change reaches: jest --changedSince and
#     vitest --changed, from the newest commit whose tree passed that step, else
#     from the merge base. --int and --all run the full suites.
#   - Integration groups run on PREPUSH_INT_DBS (default 3) test databases at
#     once, TEST_DATABASE_URL's name with -1, -2, … appended, created if missing
#     and reset by the suite's own globalSetup before every group. One jest run
#     over the whole suite can segfault, so the suite is cut into
#     PREPUSH_INT_GROUPS (default 16) shards; a shard that crashes without a
#     jest summary is retried once.
#   - Integration and browser runs are targeted, as the quick run's unit
#     tests are: only the integration specs related to the changed api files
#     (and the permission, RLS and module-annotation specs, always), and only
#     the browser specs whose `// @covers` keys the changes reach. A change
#     to the schema, seed, auth, common/ or the harness runs everything, and
#     --full forces it. A full pass counts for a targeted one.
#   - --e2e and --all, when they have specs to run, stop this repo's `pnpm
#     dev` stack (next dev, nest watch and turbo dev started from this repo
#     or one of its worktrees, matched by command line and path) to free the
#     CPU, and say how to start it again. PREPUSH_KEEP_DEV=1 leaves it
#     running. The quick run never stops anything.
#   - The browser specs run through e2e/run.mjs: fullyParallel on
#     PW_WORKERS (default 4 here), then the `@serial` ones one at a time.
#     One browser run per machine: a second `--e2e` waits for the first's
#     lock (<git common dir>/prepush-e2e.lock, PREPUSH_E2E_LOCK_WAIT
#     seconds, default 1800) instead of taking its ports, and teardown
#     stops only the servers its own run started.
#
# Measured 2026-09-29 (12-core Mac, a batch 209 files ahead): the hook 3s on a
# tree that passed, 19–32s after a code change (was 75s); --int 95s (was
# ~7 min); --all 10.7 min (was ~25), nearly all of it the browser specs.
# Targeted, on a commit touching one screen and one api module: --e2e 105s
# for 2 spec files (was 657s for 25), the integration step 9s for 10 specs
# (was 84s for 381). The CI mirrors added 2026-09-30: RLS after plain +26s
# targeted, +98s whole suite; the permission suite after the browser specs
# +83–102s.
#
# Integration needs TEST_DATABASE_URL naming a database with "test" in it (and a
# changed migration needs REPLAY_DATABASE_URL, a throwaway one; the browser step
# needs E2E_DATABASE_URL, another), and
# PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION set for the reset. It never prints
# any of them. bash 3 compatible (macOS): no mapfile, no associative arrays.
set -o pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

INT=0; E2E=0; USE_CACHE=1; FULL=0
for a in "$@"; do
    case "$a" in
        --int) INT=1 ;;
        --e2e) E2E=1 ;;
        --all) INT=1; E2E=1 ;;
        --full) FULL=1 ;;
        --no-cache) USE_CACHE=0 ;;
        *) echo "unknown option $a"; exit 2 ;;
    esac
done
# --full alone means everything, all of it.
[ "$FULL" = 1 ] && [ "$INT" = 0 ] && [ "$E2E" = 0 ] && { INT=1; E2E=1; }
QUICK=1; { [ "$INT" = 1 ] || [ "$E2E" = 1 ]; } && QUICK=0
T0=$(date +%s)

BASE=${PREPUSH_BASE:-origin/development}
git fetch -q origin development 2>/dev/null || true
# Changed-since is measured from where the branch left BASE, so a BASE that
# moved on does not count its own commits as this branch's changes.
MB=$(git merge-base "$BASE" HEAD 2>/dev/null || echo "$BASE")
CHANGED=$(git diff --name-only "$MB" HEAD)

COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd)
PASSES=$COMMON/prepush-cache
mkdir -p "$PASSES"
# A tree two weeks old is not coming back.
find "$PASSES" -type f -mtime +14 -delete 2>/dev/null
TURBO_FORCE=""; [ "$USE_CACHE" = 0 ] && TURBO_FORCE="--force=true"

# The tree the pass cache is keyed on: HEAD's, and only when the working tree
# holds nothing else (untracked files are ignored, as git does).
TREE=""
if [ -z "$(git status --porcelain --untracked-files=no)" ]; then
    TREE=$(git rev-parse 'HEAD^{tree}')
else
    echo "    (tracked files are modified: nothing is read from or written to the pass cache)"
fi
# Trees that differ from HEAD's only in docs and Markdown, which no step reads
# (CI's `changes` job skips its code gates on them too): a pass on one of them
# is a pass here. HEAD's own first; then its first-parent ancestors, up to the
# first commit that changed code.
SAME_CODE=$TREE
if [ -n "$TREE" ]; then
    for c in $(git rev-list --first-parent --max-count=20 HEAD~1 2>/dev/null); do
        git diff --name-only "$c" HEAD | grep -qvE '^(docs/|.*\.md$)' && break
        SAME_CODE="$SAME_CODE $(git rev-parse "$c^{tree}")"
    done
fi

W=$(mktemp -d -t prepush)
LOG=$W/step.log
FAILED=""
# cached <step> [<step that also counts>…]
cached() {
    local s t
    [ "$USE_CACHE" = 1 ] && [ -n "$TREE" ] || return 1
    # Never cached: a leak lives in history, an advisory is published after
    # the tree passed, and a build is a means.
    case "$1" in secrets | audit | int-build | deps) return 1 ;; esac
    for t in $SAME_CODE; do
        for s in "$@"; do [ -f "$PASSES/$t-$s" ] && return 0; done
    done
    return 1
}
record() {
    case "$1" in secrets | audit | int-build | deps) return 0 ;; esac
    [ -n "$TREE" ] && date +%s >"$PASSES/$TREE-$1"; return 0
}
say() { printf '=== %-16s %s\n' "$1" "$2"; }
# step <name> <command…>: runs it unless this tree already passed it. A full
# pass of a step counts for its changed-only form ("vitest" for
# "vitest:changed").
step() {
    local name=$1 s; shift
    if cached "$name" "${name%:changed}"; then say "$name" "PASS (cached)"; return 0; fi
    printf '=== %-16s ' "$name"
    s=$(date +%s)
    if "$@" >"$LOG" 2>&1; then
        echo "PASS ($(( $(date +%s) - s ))s)"; record "$name"
    else
        echo "FAIL ($(( $(date +%s) - s ))s)"; tail -40 "$LOG"; FAILED="$FAILED $name"
    fi
}
# bg_step <name> <command…>: the same, in the background; bg_report prints it.
# Waits on its own jobs only: the browser run is in the background too.
BG=""; BG_PIDS=""
bg_step() {
    local name=$1; shift
    BG="$BG $name"
    if cached "$name" "${name%:changed}"; then echo cached >"$W/$name.rc"; return 0; fi
    ( s=$(date +%s); "$@" >"$W/$name.log" 2>&1; echo "$? $(( $(date +%s) - s ))" >"$W/$name.rc" ) &
    BG_PIDS="$BG_PIDS $!"
}
bg_report() {
    local name rc secs note p
    for p in $BG_PIDS; do wait "$p"; done
    BG_PIDS=""
    for name in $BG; do
        read -r rc secs note <"$W/$name.rc"
        if [ "$rc" = cached ]; then say "$name" "PASS (cached)"
        elif [ "$rc" = 0 ] && [ -n "$note" ]; then say "$name" "PASS ($note)"; record "$name"
        elif [ "$rc" = 0 ]; then say "$name" "PASS (${secs}s)"; record "$name"
        else say "$name" "FAIL (${secs}s)"; tail -40 "$W/$name.log"; FAILED="$FAILED $name"
        fi
    done
    BG=""
}

# Packages changed since the merge base, and everything that depends on them —
# the same set CI's `...[base]` filter reaches. Asked lazily: a fully cached
# run never starts turbo.
AFFECTED_LIST=""
affected() {
    if [ -z "$AFFECTED_LIST" ]; then
        AFFECTED_LIST=$(pnpm -s exec turbo ls --filter="...[$MB]" 2>/dev/null |
            sed -nE 's/^  ([^ ]+) .*/\1/p')
        [ -n "$AFFECTED_LIST" ] || AFFECTED_LIST="(none)"
    fi
    echo "$AFFECTED_LIST" | grep -qx "$1"
}
TURBO="pnpm -s exec turbo run --output-logs=errors-only $TURBO_FORCE"
# Builds what the affected packages' tests import: the packages they depend
# on, and @saroh/database's own build (its prisma generate) when it is one of
# them. Done apart, and the tests then run with --only, because turbo hashes a
# run's pass-through arguments into EVERY task in it: `-- --changed=<sha>`
# made every ^build a cache miss, rebuilt on each commit.
test_deps() {
    local p f=""
    affected x
    for p in $AFFECTED_LIST; do
        [ "$p" = "(none)" ] && continue
        f="$f --filter=$p^..."
    done
    affected @saroh/database && f="$f --filter=@saroh/database"
    [ -n "$f" ] || return 0
    # shellcheck disable=SC2086
    $TURBO build $f
}

# ---------------------------------------------------------------------------
# 4. (defined first, started early) Browser specs for the screens this branch
# touched, on CI's stack.
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
# `.env` leaks in — a runner has none either. It shares nothing with the
# integration step: its own database, CI's ports, which the integration specs
# never bind (they listen on port 0). If one of CI's ports is taken, the step
# says which and stops.
#
# Needs E2E_DATABASE_URL naming a throwaway database with "test" in its name.
# It is dropped and re-created each run. Server logs stay in $E2E_LOGS.
# A route folder or a component folder that changed picks every spec that
# names it. Both projects: the phone has its own bars, sheets and toasts.
# The detached worktree both browser suites run from, at HEAD and installed.
e2e_worktree() {
    local dir=$1
    if [ -d "$dir/.git" ] || [ -f "$dir/.git" ]; then
        git -C "$dir" checkout -q --detach -f "$SHA"
        # Another unit's run leaves its untracked files here (a spec file
        # this tree doesn't have ran, and failed, in T4's run). Ignored
        # files, node_modules and .next, stay.
        git -C "$dir" clean -fdq
    else
        git worktree add -q --detach -f "$dir" "$SHA"
    fi
    cd "$dir"
    echo "--- worktree $dir at $(git rev-parse --short HEAD)"
    pnpm install --frozen-lockfile --prefer-offline
}
e2e_stack() {
    set -e
    local url=$1 name=$2 dir=$3 specs=$4
    local maint
    maint=$(echo "$url" | sed -E 's#/[^/?]+(\?.*)?$#/postgres#')
    e2e_worktree "$dir"
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
    # The API's links to the renderer (pay links, DEC-069 L6): this stack's,
    # never production's saroh.app, which a redirect would otherwise leave for.
    export RENDERER_URL=http://localhost:3005
    export SITE_RELAY_SECRET=saroh-dev-insecure-site-relay-secret-not-for-production
    export SITE_ACCOUNTS_CODE_SECRET=ci-placeholder-site-code-secret-at-least-32-chars # gitleaks:allow (CI placeholder)
    export SITE_CODES_EMAIL_FAKE=log
    export PAYMENTS_ENC_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef # gitleaks:allow (test key, as in the API specs)

    # The run's database is a copy of a seeded template, "<name>-template",
    # when the template was seeded from the same migrations, schema and seed
    # sources on the same day (e2e_seed_key), within the last
    # PREPUSH_E2E_TEMPLATE_HOURS (default 4): the showcase lays its diary out
    # relative to the moment it runs. The key and the time it was seeded are
    # the template's COMMENT, which a copy does not inherit, so nothing extra
    # lands in the run's database. `CREATE DATABASE … TEMPLATE` is a file
    # copy (about a second, against ~40s of migrate and seed); it needs no one
    # connected to the template, and nothing but this ever connects to it.
    local tpl="$name-template" key meta seeded_at max_age s
    key=$(e2e_seed_key)
    max_age=$(( ${PREPUSH_E2E_TEMPLATE_HOURS:-4} * 3600 ))
    meta=$(psql "$maint" -tAc "SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = '$tpl'" 2>/dev/null || true)
    seeded_at=$(echo "$meta" | sed -nE "s/^prepush-e2e $key ([0-9]+)$/\1/p")
    s=$(date +%s)
    dropdb --if-exists --force --maintenance-db="$maint" "$name"
    if [ "$USE_CACHE" = 1 ] && [ -n "$seeded_at" ] &&
        [ $(( s - seeded_at )) -lt "$max_age" ]; then
        echo "--- database: a copy of $tpl (seeded $(( (s - seeded_at) / 60 )) min ago, key $key)"
        createdb --maintenance-db="$maint" --template="$tpl" "$name"
        echo "    copied in $(( $(date +%s) - s ))s"
        echo "--- build"
        pnpm turbo run build --log-order=grouped \
            --filter=@saroh/database --filter=@saroh/api --filter=auth \
            --filter=application --filter=sites
    else
        echo "--- database: fresh, migrated and seeded (no template for key $key)"
        createdb --maintenance-db="$maint" "$name"
        pnpm --filter @saroh/database db:migrate:deploy

        # As CI: the seed and the build in one turbo run, so they overlap;
        # turbo still makes the seed wait for the builds it runs on
        # (turbo.json). Seeded into the run's own database, so DATABASE_URL —
        # which turbo hashes into every task — is the same on both paths and
        # a build replays from turbo's cache either way.
        echo "--- seed and build"
        pnpm turbo run db:seed:showcase build --log-order=grouped \
            --filter=@saroh/database --filter=@saroh/api --filter=auth \
            --filter=application --filter=sites
        echo "    migrated, seeded and built in $(( $(date +%s) - s ))s"

        # Kept for the next run, before anything connects to this one.
        dropdb --if-exists --force --maintenance-db="$maint" "$tpl"
        createdb --maintenance-db="$maint" --template="$name" "$tpl"
        psql "$maint" -qc "COMMENT ON DATABASE \"$tpl\" IS 'prepush-e2e $key $s'"
        echo "    kept as $tpl for the next run"
    fi

    # Each server's PID goes in $E2E_LOGS/pids, and teardown (stop_stack)
    # stops those and what they started — never "whatever listens on 3000",
    # which once was another run's stack.
    echo "--- start the stack (logs in $E2E_LOGS)"
    pnpm --filter @saroh/api start >"$E2E_LOGS/api.log" 2>&1 &
    echo $! >>"$E2E_LOGS/pids"
    pnpm --filter auth exec next start -p 3000 >"$E2E_LOGS/accounts.log" 2>&1 &
    echo $! >>"$E2E_LOGS/pids"
    pnpm --filter application exec next start -p 3003 >"$E2E_LOGS/app.log" 2>&1 &
    echo $! >>"$E2E_LOGS/pids"
    pnpm --filter sites exec next start -p 3005 >"$E2E_LOGS/renderer.log" 2>&1 &
    echo $! >>"$E2E_LOGS/pids"
    wait_up api http://localhost:3333/health "200 307"
    wait_up accounts http://localhost:3000/login "200 307"
    wait_up app http://localhost:3003/ "200 307"
    wait_up renderer http://localhost:3005/preview/not-a-token "200 307 404"

    # The runner (e2e/run.mjs): sign in once, then desk and phone in
    # parallel on PW_WORKERS, then the @serial tests one at a time.
    echo "--- specs:$specs"
    cd e2e
    # shellcheck disable=SC2086
    PW_WORKERS=${PW_WORKERS:-4} node run.mjs $specs
}
# What the seeded template depends on: the migrations and schema, the seed
# and everything it imports (the showcase, the block contract its sections
# are checked against, better-auth's password hasher through the lockfile),
# and the day in India, where the seed counts "today". Git's own object ids
# for those paths at HEAD, so it costs nothing. CI's browser shards key their
# database dump on the same files.
e2e_seed_key() {
    local p
    {
        for p in packages/database/prisma packages/database/src \
            packages/database/package.json packages/block-contract/src \
            pnpm-lock.yaml; do
            git rev-parse "HEAD:$p" 2>/dev/null || echo "no $p"
        done
        TZ=Asia/Kolkata date +%F
    } | shasum | cut -c1-12
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
    # Only what this run started: the servers' PIDs (e2e_stack writes them)
    # and their descendants — next-server, node dist/main. Never by port: a
    # second run on the same machine once SIGTERMed the first one's stack.
    local all="" kids more p
    [ -n "${E2E_LOGS:-}" ] && [ -f "$E2E_LOGS/pids" ] || return 0
    kids=$(cat "$E2E_LOGS/pids")
    while [ -n "$kids" ]; do
        all="$all $kids"; more=""
        for p in $kids; do more="$more $(pgrep -P "$p" 2>/dev/null | tr '\n' ' ' || true)"; done
        kids=$(echo "$more" | xargs)
    done
    # A server already gone makes kill answer 1: under the caller's `set -e`
    # that would fail a green run from inside its EXIT trap.
    # shellcheck disable=SC2086
    if [ -n "$all" ]; then kill $all 2>/dev/null || true; fi
    rm -f "$E2E_LOGS/pids"
    return 0
}

# One browser run per machine at a time: they share CI's ports, the
# $E2E_DIR worktree and the E2E database. `flock` isn't on macOS, so the
# lock is a directory (mkdir is atomic) under the git common dir holding
# the owner's PID; one whose PID is dead is stale and taken over. A second
# `--e2e` waits up to PREPUSH_E2E_LOCK_WAIT seconds (default 1800) for the
# first to finish, saying whose run it waits on, then fails clearly.
E2E_LOCK=$COMMON/prepush-e2e.lock
e2e_lock() {
    local waited=0 limit=${PREPUSH_E2E_LOCK_WAIT:-1800} holder said=""
    while ! mkdir "$E2E_LOCK" 2>/dev/null; do
        holder=$(cat "$E2E_LOCK/pid" 2>/dev/null)
        if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
            echo "--- lock: $holder is gone; taking its stale lock"
            rm -rf "$E2E_LOCK"
            continue
        fi
        if [ "$waited" -ge "$limit" ]; then
            echo "e2e lock: another browser run (pid ${holder:-?}) has held $E2E_LOCK for ${limit}s — not starting a second one on its ports"
            return 1
        fi
        [ -z "$said" ] && echo "--- lock: waiting for the browser run in pid ${holder:-?} to finish ($E2E_LOCK)" && said=1
        sleep 5; waited=$((waited + 5))
    done
    echo "$1" >"$E2E_LOCK/pid"
}
e2e_unlock() {
    [ "$(cat "$E2E_LOCK/pid" 2>/dev/null)" = "$1" ] && rm -rf "$E2E_LOCK"
    return 0
}

# This repo's `pnpm dev` stack (portless), started from the main checkout or
# any of its worktrees: turbo dev, next dev, nest watch and the portless
# wrappers, matched by command line AND a path under one of those checkouts,
# plus whatever they started. Never matched by a bare program name.
stop_dev_stack() {
    local roots r pid cmd hit tops="" kids all="" more p restart=""
    roots=$(git worktree list --porcelain | sed -n 's/^worktree //p')
    while read -r pid cmd; do
        case "$cmd" in
            *"turbo run dev"* | *"turbo dev"* | *"next dev"* | *"nest start"* | *"portless/dist/cli.js"*) ;;
            *) continue ;;
        esac
        hit=""
        for r in $roots; do
            [ "$r" = "$E2E_DIR" ] && continue
            case "$cmd" in *"$r/"*) hit=$r ;; esac
        done
        [ -n "$hit" ] || continue
        tops="$tops $pid"
        case "$cmd" in
            *"turbo run dev"*)
                restart="$restart
    (cd $hit && pnpm turbo run dev${cmd##*turbo run dev})" ;;
        esac
    done <<EOF
$(ps -axo pid=,command=)
EOF
    if [ -z "$tops" ]; then
        echo "    (no dev stack of this repo is running)"
        return 0
    fi
    # Their descendants too: next-server, node dist/main, package watchers.
    all=$tops; kids=$tops
    while [ -n "$kids" ]; do
        more=""
        for p in $kids; do more="$more $(pgrep -P "$p" 2>/dev/null | tr '\n' ' ')"; done
        kids=$(echo "$more" | xargs)
        all="$all $kids"
    done
    all=$(echo "$all" | tr " " "\n" | grep . | sort -un | tr "\n" " ")
    echo "=== stop dev stack  (frees the CPU for the build and the specs)"
    for p in $all; do
        cmd=$(ps -o command= -p "$p" 2>/dev/null) || continue
        echo "    stopped $p ${cmd:0:110}"
    done
    # shellcheck disable=SC2086
    kill $all 2>/dev/null || true
    echo "    start it again with \`pnpm dev\` (or \`pnpm dev:app\`) in its checkout; it was:$restart"
}

# 4b. The permission states on a production build: a mirror of CI's
# "Permission states (production build)" job (`permissions-e2e`), which runs
# `pnpm --filter @saroh/e2e test:permissions` with PERMISSIONS_APP_URL and
# PERMISSIONS_API_URL set and nothing else. It is not the seeded stack:
# e2e/permissions.config.ts starts its own two servers through Playwright's
# webServer, a fake api (e2e/fixtures/permissions-api.mjs, per-role answers)
# on 3334 and app.saroh.in built for it — `turbo run build` then `next start`
# on 3004, so errors are redacted as in production. The app's NEXT_PUBLIC_*
# urls point at the fake api and are baked into that build, so it can't share
# the browser step's build of the app; turbo keys each on its env, and both
# replay from its cache the next time. So it runs after the browser specs, in
# the same worktree and under the same lock, and never beside them: one
# production build of the app at a time.
#
# The same env as the runner: only PATH, HOME, USER, TMPDIR and LANG pass
# through from this shell, plus CI=1 and the two urls, so no DATABASE_URL,
# NEXT_PUBLIC_* or other local setting reaches the build.
e2e_perms() {
    set -e
    local dir=$1 specs=$2
    e2e_worktree "$dir"
    echo "--- permission suite:${specs:- every spec}"
    # shellcheck disable=SC2086
    env -i PATH="$PATH" HOME="$HOME" USER="${USER:-}" TMPDIR="${TMPDIR:-/tmp}" \
        LANG="${LANG:-en_US.UTF-8}" CI=1 \
        PERMISSIONS_APP_URL=http://localhost:3004 PERMISSIONS_API_URL=http://localhost:3334 \
        pnpm --filter @saroh/e2e test:permissions $specs
}

E2E_PID=""; E2E_STATUS=""; PERM_STATUS=""
# The specs are chosen by scripts/e2e-affected.mjs: every spec names what it
# exercises (`// @covers app:/commerce/orders api:orders …`), and the branch's
# changed files are mapped onto those keys through an import scan of the apps
# and the api. A global change (schema, seed, ui, auth, tooling, CI, root
# config) picks all of them; so does --full. CI always runs every spec.
# The permission suite is chosen the same way (`--suite permissions`, its
# specs' @covers name the app routes they open); an api change never picks
# it, since it answers with a fake api.
e2e_start() {
    local total ports p
    # Keyed on HEAD's tree even when files are modified: HEAD is what it tests.
    E2E_TREE=$(git rev-parse 'HEAD^{tree}')
    if [ "$FULL" = 1 ]; then
        E2E_STEP=e2e-desk-phone; PERM_STEP=e2e-permissions
    else
        E2E_STEP=e2e-desk-phone:affected; PERM_STEP=e2e-permissions:affected
    fi
    if [ "$USE_CACHE" = 1 ] && { [ -f "$PASSES/$E2E_TREE-$E2E_STEP" ] ||
        [ -f "$PASSES/$E2E_TREE-e2e-desk-phone" ]; }; then
        E2E_STATUS=cached
    else
        total=$(ls e2e/tests/*.spec.ts | wc -l | tr -d ' ')
        if [ "$FULL" = 1 ]; then
            specs=$(cd e2e && ls tests/*.spec.ts)
            echo "=== e2e selection   all $total specs (--full)"
        else
            specs=$(echo "$CHANGED" | node scripts/e2e-affected.mjs --stdin 2>"$W/e2e-why.log")
            echo "=== e2e selection   $(head -1 "$W/e2e-why.log" | sed 's/^e2e: //')"
            sed -n '2,60p' "$W/e2e-why.log"
            [ "$(wc -l <"$W/e2e-why.log")" -gt 60 ] && echo "      … (full list: $W/e2e-why.log)"
        fi
        specs=$(echo $specs)
        e2e_db=$(echo "${E2E_DATABASE_URL:-}" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')
        if [ -z "$specs" ]; then E2E_STATUS=none
        elif [ -z "${E2E_DATABASE_URL:-}" ] || ! echo "$e2e_db" | grep -q test; then E2E_STATUS=nodb
        else E2E_STATUS=run
        fi
    fi
    if [ "$USE_CACHE" = 1 ] && { [ -f "$PASSES/$E2E_TREE-$PERM_STEP" ] ||
        [ -f "$PASSES/$E2E_TREE-e2e-permissions" ]; }; then
        PERM_STATUS=cached
    else
        if [ "$FULL" = 1 ]; then
            perm_specs=""; PERM_STATUS=run
            echo "=== permissions     every spec (--full)"
        else
            perm_specs=$(echo "$CHANGED" | node scripts/e2e-affected.mjs --suite permissions --stdin 2>"$W/perm-why.log")
            echo "=== permissions     $(head -1 "$W/perm-why.log" | sed 's/^e2e: //')"
            sed -n '2,20p' "$W/perm-why.log"
            perm_specs=$(echo $perm_specs)
            if [ -z "$perm_specs" ]; then PERM_STATUS=none; else PERM_STATUS=run; fi
        fi
    fi
    [ "$E2E_STATUS" = run ] || [ "$PERM_STATUS" = run ] || return 0

    # Only a run that has specs to run takes the CPU back from `pnpm dev`.
    if [ "${PREPUSH_KEEP_DEV:-}" = 1 ]; then
        echo "    (PREPUSH_KEEP_DEV=1: the dev stack is left running)"
    else
        stop_dev_stack
    fi
    [ -n "$(git status --porcelain)" ] && \
        echo "    (uncommitted changes are not in the browser run: it tests HEAD)"
    SHA=$(git rev-parse HEAD)
    E2E_LOGS=$(mktemp -d -t prepush-e2e-logs)
    [ "$E2E_STATUS" = run ] &&
        echo "=== e2e (in the background) $(echo "$specs" | wc -w | tr -d ' ') spec files, desk + phone"
    [ "$PERM_STATUS" = run ] &&
        echo "=== permissions (in the background, after the browser specs) desk + phone, production build"
    ports=""
    [ "$E2E_STATUS" = run ] && ports="3333 3000 3003 3005"
    [ "$PERM_STATUS" = run ] && ports="$ports 3004 3334"
    trap stop_stack EXIT
    # In the background: the lock first (waiting on another run, if one is
    # going), then CI's ports — free, or taken by something that isn't a
    # browser run — and only then the worktree, the database and the stack;
    # then the permission suite. Each part leaves "<rc> <seconds>" in
    # $E2E_LOGS/<part>.rc.
    (
        me=$(sh -c 'echo $PPID')
        e2e_lock "$me" || exit 3
        # The stack goes before the lock does, so the next run finds the
        # ports free; a signal takes the same way out.
        trap 'stop_stack; e2e_unlock "$me"' EXIT
        trap 'exit 130' INT TERM
        busy=""
        for p in $ports; do
            lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 && busy="$busy $p"
        done
        if [ -n "$busy" ]; then
            echo "e2e ports taken:$busy — stop whatever listens there (a bare-port dev server?)"
            exit 4
        fi
        if [ "$E2E_STATUS" = run ]; then
            s=$(date +%s)
            ( e2e_stack "$E2E_DATABASE_URL" "$e2e_db" "$E2E_DIR" "$specs" ) >"$E2E_LOGS/run.log" 2>&1
            echo "$? $(( $(date +%s) - s ))" >"$E2E_LOGS/browser.rc"
            stop_stack
        fi
        if [ "$PERM_STATUS" = run ]; then
            s=$(date +%s)
            ( e2e_perms "$E2E_DIR" "$perm_specs" ) >"$E2E_LOGS/permissions.log" 2>&1
            echo "$? $(( $(date +%s) - s ))" >"$E2E_LOGS/permissions.rc"
        fi
    ) >"$E2E_LOGS/job.log" 2>&1 &
    E2E_PID=$!
}
# e2e_part <step> <part> <log> <grep pattern>: one part's result.
e2e_part() {
    local step=$1 part=$2 log=$3 pattern=$4 rc secs
    if [ ! -f "$E2E_LOGS/$part.rc" ]; then
        say "$step" "FAIL (never ran)"
        tail -5 "$E2E_LOGS/job.log"
        echo "    logs: $E2E_LOGS"
        FAILED="$FAILED $step"; return 0
    fi
    read -r rc secs <"$E2E_LOGS/$part.rc"
    if [ "$rc" = 0 ]; then
        say "$step" "PASS (${secs}s)"
        # It tested HEAD's tree, whatever the working tree holds.
        date +%s >"$PASSES/$E2E_TREE-$step"
    else
        say "$step" "FAIL (${secs}s)"
        grep -E "$pattern" "$E2E_LOGS/$log" | tail -40
        echo "    run log and server logs: $E2E_LOGS"
        FAILED="$FAILED $step"
    fi
}
e2e_finish() {
    case "$E2E_STATUS" in
        cached) say "$E2E_STEP" "PASS (cached)" ;;
        none) say e2e "no spec covers what changed (scripts/e2e-affected.mjs); CI runs them all" ;;
        nodb) say e2e "FAIL — set E2E_DATABASE_URL to a throwaway *test* database (it is dropped and re-created)"
            FAILED="$FAILED e2e(db)" ;;
    esac
    case "$PERM_STATUS" in
        cached) say "$PERM_STEP" "PASS (cached)" ;;
        none) say permissions "no permission spec covers what changed (--suite permissions); CI runs them all" ;;
    esac
    [ -n "$E2E_PID" ] || return 0
    [ "$INT" = 1 ] && echo "    (waiting for the browser run)"
    wait "$E2E_PID"
    [ "$E2E_STATUS" = run ] && e2e_part "$E2E_STEP" browser run.log \
        "✘|^\s+[0-9]+ (failed|passed|skipped|flaky)|never came up|Error:|=== e2e:"
    [ "$PERM_STATUS" = run ] && e2e_part "$PERM_STEP" permissions permissions.log \
        "✘|^\s+[0-9]+ (failed|passed|skipped|flaky)|Error:|ELIFECYCLE|Timed out|already used"
    stop_stack
    trap - EXIT
}

# ---------------------------------------------------------------------------
# 1. Secrets. The repo is public: a hit is a leak, not a lint. Never cached:
# a secret committed and then deleted leaves the same tree behind.
if [ "$INT" = 1 ]; then
    case "${TEST_DATABASE_URL:-}" in
        *test*) ;;
        *) echo "TEST_DATABASE_URL must name a test database"; exit 1 ;;
    esac
fi
# Ctrl-C stops everything this run started: workers, jest, the e2e stack.
trap 'trap - INT TERM; [ -n "$E2E_PID" ] && stop_stack; kill 0' INT TERM
if command -v gitleaks >/dev/null 2>&1; then
    step secrets gitleaks git . --redact --no-banner --exit-code 1 \
        --log-opts="$BASE..HEAD"
else
    echo "=== secrets          SKIP — install gitleaks (brew install gitleaks); CI runs it"
fi

# CI's dependency audit (critical only), the same rule: a critical advisory
# fails; an unreachable registry is a warning. Never cached, because a new
# advisory fails a tree that passed yesterday (#771, Next.js next/og RCE).
audit_critical() {
    local out attempt
    for attempt in 1 2 3; do
        if out=$(pnpm audit --audit-level critical 2>&1); then return 0; fi
        if ! printf '%s' "$out" | grep -qE 'ERR_SOCKET_TIMEOUT|ETIMEDOUT|ECONNRESET|ENOTFOUND|FetchError'; then
            printf '%s\n' "$out" | grep -E '│ (critical|Package|Vulnerable|Patched)|More info|Severity'
            return 1
        fi
        sleep 10
    done
    echo "audit: registry unreachable; CI will run it"
    return 0
}
step audit audit_critical

E2E_DIR=${PREPUSH_E2E_DIR:-${TMPDIR:-/tmp}/saroh-prepush-e2e}
if [ "$E2E" = 1 ]; then
    # Started now: it builds from its own worktree while everything else runs.
    e2e_start
fi

# 2. Static checks and unit tests, side by side.
#
# The check:* scripts read sources only, so they start at once. Everything
# that goes through turbo first waits for one build of what the affected
# packages import (test_deps), then runs with --only, so no two turbo runs
# ever build the same package at the same time.
bg_step routes pnpm run check:routes
bg_step blocks pnpm run check:blocks
bg_step cycles pnpm run check:cycles
bg_step e2e-covers pnpm run check:e2e-covers

# Unit tests. The quick run takes only the specs the change reaches; --int and
# --all run the full suites. As CI: the api's unit tests mock the environment,
# so its zod check is skipped.
#
# "Changed" is counted from the newest commit on this branch whose tree
# already passed that step (the specs its changes reached passed there, and
# everything before it was covered by that run's own base), else from the
# merge base. A small commit on a branch that passed a moment ago tests only
# what that commit reaches, not the whole branch again.
since() {
    local c t s
    [ "$USE_CACHE" = 1 ] || { echo "$MB"; return 0; }
    for c in $(git rev-list --first-parent --max-count=50 "$MB..HEAD" 2>/dev/null); do
        t=$(git rev-parse "$c^{tree}")
        for s in "$@"; do
            [ -f "$PASSES/$t-$s" ] && { echo "$c"; return 0; }
        done
    done
    echo "$MB"
}
if [ "$QUICK" = 1 ]; then
    API_UNIT=api-unit:changed; VITEST=vitest:changed
    JEST_ARGS="-- --changedSince=$(since api-unit:changed api-unit)"
    VITEST_ARGS="-- --changed=$(since vitest:changed vitest) --passWithNoTests"
else
    API_UNIT=api-unit; VITEST=vitest
    JEST_ARGS=""; VITEST_ARGS=""
fi

if ! cached lint || ! cached typecheck || ! cached "$API_UNIT" api-unit ||
    ! cached "$VITEST" vitest; then
    step deps test_deps
fi
# lint and typecheck over the affected packages, as CI's static job.
bg_step lint $TURBO lint --only --filter="...[$MB]"
bg_step typecheck $TURBO typecheck --only --filter="...[$MB]"
if cached "$API_UNIT" api-unit; then
    BG="$BG $API_UNIT"; echo cached >"$W/$API_UNIT.rc"
elif ! affected @saroh/api; then
    BG="$BG $API_UNIT"; echo "0 0 the api is not affected" >"$W/$API_UNIT.rc"
else
    # shellcheck disable=SC2086
    bg_step "$API_UNIT" env SKIP_ENV_VALIDATION=1 $TURBO test:unit --only \
        --filter=@saroh/api $JEST_ARGS
fi
# Every other package with a `test` script, as CI's unit job runs them.
# shellcheck disable=SC2086
bg_step "$VITEST" $TURBO test --only --filter="...[$MB]" --filter='!@saroh/api' \
    $VITEST_ARGS
bg_report

# A new migration must replay onto an empty database and match schema.prisma.
# REPLAY_DATABASE_URL names a throwaway database (its name must contain "test"),
# dropped and re-created each run: the replay must start from nothing.
replay() {
    local rdb rmaint
    rdb=$(echo "$REPLAY_DATABASE_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')
    rmaint=$(echo "$REPLAY_DATABASE_URL" | sed -E 's#/[^/?]+(\?.*)?$#/postgres\1#')
    case "$rdb" in *test*) ;; *) echo "REPLAY_DATABASE_URL must name a *test* database"; return 1 ;; esac
    dropdb --if-exists --force --maintenance-db="$rmaint" "$rdb" &&
        createdb --maintenance-db="$rmaint" "$rdb" &&
        DATABASE_URL="$REPLAY_DATABASE_URL" DATABASE_TARGET_CONFIRM="$rdb" \
            pnpm --filter @saroh/database db:verify:replay
}
if echo "$CHANGED" | grep -q "^packages/database/prisma/"; then
    case "${REPLAY_DATABASE_URL:-}" in
        # Beside the integration run: its own database, mostly waiting on Postgres.
        *test*) bg_step db-replay replay ;;
        *)
            if cached db-replay; then say db-replay "PASS (cached)"; else
                say db-replay "SKIP — migrations changed: set REPLAY_DATABASE_URL to a throwaway *test* database"
                [ "$INT" = 1 ] && FAILED="$FAILED db-replay(unset)"
            fi ;;
    esac
fi

# ---------------------------------------------------------------------------
# 3. API integration, in shards on parallel databases.
#
# One jest run over the whole suite can crash a worker (a segfault, no
# summary), so the suite is cut into INT_GROUPS shards (jest --shard, as CI cuts
# it). N workers each own one database and take the next unclaimed shard until
# none are left; every shard's globalSetup resets its worker's database
# (`prisma db push --force-reset`), and inside a shard the specs run serially
# with a TRUNCATE between files. Two runs on one database reset each other's
# rows and fail at random, so no two workers ever share one. Each worker also
# has its own TMPDIR: the fake site-code outbox is a file per email there.
#
# Two modes, as CI's matrix: plain (INT_TAG=int), then RLS (INT_TAG=int-rls,
# TEST_RLS=on), where each shard's globalSetup replays the migrations (where
# the policies live; ~3s) and the specs connect as a NOBYPASSRLS role
# (apps/api.saroh.in/test/rls-mode.ts). RLS runs after plain, on the same
# PREPUSH_INT_DBS databases, never beside it: every reset drops and re-creates
# the whole schema in one transaction, and Postgres' lock table is shared by
# every database (max_locks_per_transaction × max_connections, 6,400 slots
# on a default install). A reset holds one lock per table, index and sequence,
# ~800 of them, so twice the resets at once, beside another checkout's run,
# can end in "out of shared memory". The RLS
# role is one per cluster and every RLS shard's globalSetup gives it a new
# password, which a Postgres that trusts local connections (Homebrew's
# default) never checks; one that checks passwords needs PREPUSH_INT_DBS=1.
int_worker() {
    local i=$1 url=$2 k tries rc s
    local tmp=$W/$INT_TAG-tmp-$i
    mkdir -p "$tmp"
    k=1
    while [ "$k" -le "$INT_GROUPS" ]; do
        if mkdir "$W/$INT_TAG-claim-$k" 2>/dev/null; then
            tries=0
            while :; do
                tries=$((tries + 1))
                s=$(date +%s)
                # shellcheck disable=SC2086
                ( cd apps/api.saroh.in && TEST_DATABASE_URL=$url TEST_RLS=$INT_RLS TMPDIR=$tmp \
                    SKIP_ENV_VALIDATION=1 pnpm -s exec jest -c jest.integration.config.js \
                    --shard="$k/$INT_GROUPS" --cacheDirectory="$JEST_CACHE" --ci --no-watchman \
                    ${INT_RUN_PATHS:+--runTestsByPath $INT_RUN_PATHS} ) \
                    >"$W/$INT_TAG-$k.log" 2>&1
                rc=$?
                if [ $rc != 0 ] && [ $tries = 1 ] && ! grep -qE '^Tests:' "$W/$INT_TAG-$k.log"; then
                    cp "$W/$INT_TAG-$k.log" "$W/$INT_TAG-$k.crash.log"
                    printf '    %s %s/%s crashed without a jest summary on db %s — retrying once\n' "$INT_TAG" "$k" "$INT_GROUPS" "$i"
                    continue
                fi
                break
            done
            printf '%s %s %s %s\n' "$rc" "$(( $(date +%s) - s ))" "$i" "$tries" >"$W/$INT_TAG-$k.rc"
            if [ $rc = 0 ]; then
                printf '    %-7s %2s/%s  pass  %4ss  db %s%s\n' "$INT_TAG" "$k" "$INT_GROUPS" "$(( $(date +%s) - s ))" "$i" \
                    "$([ $tries = 2 ] && echo ' (after a retry)')"
            else
                printf '    %-7s %2s/%s  FAIL  %4ss  db %s\n' "$INT_TAG" "$k" "$INT_GROUPS" "$(( $(date +%s) - s ))" "$i"
            fi
        fi
        k=$((k + 1))
    done
}
int_run() {
    local n i name url maint exists k rc bad="" pids=""
    n=${PREPUSH_INT_DBS:-3}
    INT_GROUPS=${PREPUSH_INT_GROUPS:-16}
    if [ -n "$INT_RUN_PATHS" ]; then
        # A few specs a shard: each shard pays for its own schema reset.
        k=$(echo "$INT_RUN_PATHS" | wc -w | tr -d ' ')
        k=$(( (k + 2) / 3 ))
        [ "$k" -lt "$INT_GROUPS" ] && INT_GROUPS=$k
        [ "$INT_GROUPS" -lt "$n" ] && n=$INT_GROUPS
    fi
    JEST_CACHE=${TMPDIR:-/tmp}/saroh-prepush-jest
    name=$(echo "$TEST_DATABASE_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')
    maint=$(echo "$TEST_DATABASE_URL" | sed -E 's#/[^/?]+(\?.*)?$#/postgres\1#')
    i=1
    while [ $i -le "$n" ]; do
        case "$name-$i" in *test*) ;; *) echo "test database names must contain \"test\""; return 1 ;; esac
        exists=$(psql "$maint" -tAc "SELECT 1 FROM pg_database WHERE datname = '$name-$i'" 2>/dev/null)
        if [ "$exists" != 1 ]; then
            createdb --maintenance-db="$maint" "$name-$i" >/dev/null 2>&1 ||
                { echo "could not create test database $name-$i"; return 1; }
            echo "    created test database $name-$i"
        fi
        i=$((i + 1))
    done
    say "$INT_TAG" "$INT_GROUPS shards on $n test databases, $name-1 to $name-$n"
    i=1
    while [ $i -le "$n" ]; do
        url=$(echo "$TEST_DATABASE_URL" | sed -E "s#/([^/?]+)(\\?.*)?\$#/\\1-$i\\2#")
        int_worker "$i" "$url" &
        pids="$pids $!"
        i=$((i + 1))
    done
    for i in $pids; do wait "$i"; done
    k=1
    while [ $k -le "$INT_GROUPS" ]; do
        if [ ! -f "$W/$INT_TAG-$k.rc" ]; then bad="$bad $k"
        else
            read -r rc _ <"$W/$INT_TAG-$k.rc"
            [ "$rc" = 0 ] || bad="$bad $k"
        fi
        k=$((k + 1))
    done
    for k in $bad; do
        echo "--- $INT_TAG shard $k/$INT_GROUPS (log $W/$INT_TAG-$k.log)"
        grep -E "^(FAIL|Tests:|Test Suites:)|● [^C]" "$W/$INT_TAG-$k.log" | head -30
        grep -qE '^Tests:' "$W/$INT_TAG-$k.log" || tail -30 "$W/$INT_TAG-$k.log"
    done
    [ -z "$bad" ]
}
# Which integration specs. Locally, only those the change reaches: jest
# --findRelatedTests over the api files that changed (and the api files that
# import a changed workspace package), plus the specs that guard every module
# at once. A change to what every spec stands on runs the whole suite, as
# --full does. CI always runs the whole suite, plain and under RLS; so does
# this: the RLS run takes the same selection (less the specs the RLS config
# leaves out) and has its own pass, int-rls or int-rls:affected.
INT_FULL_RE='^(packages/(database|auth)/|apps/api\.saroh\.in/(src/common/|src/[^/]+\.ts$|test/|jest[^/]*$|package\.json$|tsconfig[^/]*$)|pnpm-lock\.yaml$)'
INT_ALWAYS_RE='/(capabilities/module-annotations\.spec|rls/[^/]+|[^/]+-rls\.db\.spec|[^/]*permissions?[^/.]*(\.db)?\.spec)\.ts$'
INT_PATHS=""; INT_WHY=""
if [ "$FULL" = 1 ]; then INT_STEP=int; INT_WHY="the whole suite (--full)"
else
    INT_WHY=$(echo "$CHANGED" | grep -E "$INT_FULL_RE" | head -1)
    if [ -n "$INT_WHY" ]; then INT_STEP=int; INT_WHY="the whole suite: $INT_WHY changed"
    else INT_STEP=int:affected
    fi
fi
INT_RLS_STEP=int-rls${INT_STEP#int}
int_select() {
    local srcs="" f p all related always
    for f in $(echo "$CHANGED" | grep -E '^apps/api\.saroh\.in/src/.*\.ts$'); do
        [ -f "$f" ] && srcs="$srcs ${f#apps/api.saroh.in/}"
    done
    # A workspace package the api imports (templates, object-storage, …).
    for p in $(echo "$CHANGED" | sed -nE 's#^packages/([^/]+)/.*#\1#p' | sort -u); do
        for f in $(grep -rlE "from [\"']@saroh/$p[/\"']" apps/api.saroh.in/src --include='*.ts' 2>/dev/null); do
            srcs="$srcs ${f#apps/api.saroh.in/}"
        done
    done
    all=$(cd apps/api.saroh.in && SKIP_ENV_VALIDATION=1 pnpm -s exec jest -c jest.integration.config.js \
        --listTests --no-watchman 2>/dev/null) || return 1
    always=$(echo "$all" | grep -E "$INT_ALWAYS_RE")
    related=""
    if [ -n "$srcs" ]; then
        # shellcheck disable=SC2086
        related=$(cd apps/api.saroh.in && SKIP_ENV_VALIDATION=1 pnpm -s exec jest -c jest.integration.config.js \
            --listTests --no-watchman --findRelatedTests $srcs 2>/dev/null) || return 1
    fi
    INT_PATHS=$(printf '%s\n%s\n' "$related" "$always" | grep . | sort -u | tr '\n' ' ')
    INT_WHY="$(echo "$related" | grep -c .) related to $(echo "$srcs" | wc -w | tr -d ' ') changed api files + $(echo "$always" | grep -c .) always-run (permissions, RLS, module annotations) = $(echo "$INT_PATHS" | wc -w | tr -d ' ') of $(echo "$all" | grep -c .) specs"
}
# The RLS run's specs: the plain selection, less what jest.integration.config
# leaves out under TEST_RLS (the backfill specs that need the owner's DDL).
# The whole suite needs no list: the config leaves them out itself.
int_rls_select() {
    local all p
    INT_RLS_PATHS=""
    [ -n "$INT_PATHS" ] || return 0
    all=$(cd apps/api.saroh.in && TEST_RLS=on SKIP_ENV_VALIDATION=1 pnpm -s exec jest \
        -c jest.integration.config.js --listTests --no-watchman 2>/dev/null) || return 1
    for p in $INT_PATHS; do
        echo "$all" | grep -qxF "$p" && INT_RLS_PATHS="$INT_RLS_PATHS $p"
    done
    return 0
}
# int_mode plain|rls: one integration run, recorded as its own step.
int_mode() {
    local name s
    if [ "$1" = rls ]; then
        INT_TAG=int-rls; INT_RLS=on; name=$INT_RLS_STEP
        if ! int_rls_select; then
            say "$name" "FAIL — could not list the RLS specs"; FAILED="$FAILED $name"; return 0
        fi
        INT_RUN_PATHS=$INT_RLS_PATHS
        if [ -n "$INT_PATHS" ]; then
            say int-rls "the same selection under TEST_RLS=on: $(echo "$INT_RUN_PATHS" | wc -w | tr -d ' ') specs"
        else
            say int-rls "the whole suite under TEST_RLS=on"
        fi
    else
        INT_TAG=int; INT_RLS=""; name=$INT_STEP; INT_RUN_PATHS=$INT_PATHS
    fi
    s=$(date +%s)
    if int_run; then say "$name" "PASS ($(( $(date +%s) - s ))s)"; record "$name"
    else say "$name" "FAIL ($(( $(date +%s) - s ))s)"; FAILED="$FAILED $name"
    fi
}
if [ "$INT" = 1 ]; then
    INT_NEED=""
    if cached "$INT_STEP" int; then say "$INT_STEP" "PASS (cached)"; else INT_NEED=plain; fi
    if cached "$INT_RLS_STEP" int-rls; then say "$INT_RLS_STEP" "PASS (cached)"; else INT_NEED="$INT_NEED rls"; fi
    if [ -n "$INT_NEED" ]; then
        # The api's workspace packages are consumed built, as in CI.
        step int-build $TURBO build --filter='@saroh/api^...'
        if [ "$INT_STEP" = int ] || int_select; then
            say int "$INT_WHY"
            # One mode after the other, never side by side (int_worker).
            for m in $INT_NEED; do int_mode "$m"; done
        else say "$INT_STEP" "FAIL — could not list the integration specs"; FAILED="$FAILED $INT_STEP"
        fi
    fi
fi

bg_report
[ "$E2E" = 1 ] && e2e_finish

[ -n "$W" ] && [ -z "$FAILED" ] && rm -rf "$W"
echo "--- $(( $(date +%s) - T0 ))s"
if [ -n "$FAILED" ]; then
    echo "FAILED:$FAILED"; exit 1
fi
echo "ALL PASS — push the batch."
