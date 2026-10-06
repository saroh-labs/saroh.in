#!/bin/bash
# Fails when a tracked file holds one of Saroh's private values: real plan
# prices and limits, which live only in the database (entered in the admin
# console). The repo is public, so the values to look for can't be in it
# either: they're read from a file on the owner's machine, one Perl-style
# regex per line (# starts a comment), at $SAROH_PRIVATE_TERMS or
# ~/.config/saroh/private-terms.txt. Without that file the check can't run,
# and says so instead of passing.
#
#   scripts/check-private-terms.sh [<skip-reason-file>]
set -uo pipefail
TERMS=${SAROH_PRIVATE_TERMS:-$HOME/.config/saroh/private-terms.txt}
SKIP=${1:-/dev/null}
if [ ! -s "$TERMS" ]; then
    echo "no private terms file at $TERMS" >"$SKIP"
    exit 0
fi
patterns=$(mktemp)
trap 'rm -f "$patterns"' EXIT
grep -v '^\s*#' "$TERMS" | grep -v '^\s*$' >"$patterns"
[ -s "$patterns" ] || { echo "the private terms file is empty" >"$SKIP"; exit 0; }
# Tracked files only, the whole tree: a value committed long ago is as public
# as one committed today. Line numbers, never the private file's own lines.
if git grep -n -I -P -f "$patterns" -- . ':!pnpm-lock.yaml'; then
    echo
    echo "A private value (a real price or limit) is in a tracked file above."
    echo "Prices live in the database; use the sample catalogue in code."
    exit 1
fi
exit 0
