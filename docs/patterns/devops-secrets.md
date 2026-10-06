# Secrets

> **Read when:** handling a credential, writing a connection string anywhere,
> adding an environment variable that holds a secret, or finding one where it
> should not be.
> Adapted from claude-patterns `devops/03-secrets.md`.

## In place — **Current**

- **gitleaks** scans the full git history in CI (the `secret-scan` job, pinned
  version and checksum). Reviewed false positives live in `.gitleaksignore`,
  keyed by fingerprint.
- `.env.example` files hold placeholders only: the root, `apps/api.saroh.in`
  (with `.env.test.example`) and `apps/saroh.in`.
- Provider credentials are encrypted at rest and never returned
  (`backend-integrations.md`); logs redact sensitive headers and fields
  (`devops-observability.md`).
- Test fixtures use visibly fake values (`user:pass@prod-host`).
- `.claude/settings.local.json` is ignored by git.

## Rules

- **Adopted** — **Scan before committing, not only in CI.** Gap: the pre-commit
  hook runs lint-staged only.
- **Adopted** — **Never commit a credential that reaches a shared host** — test
  environments included — in code, docs, AGENTS.md, a skill, a plan or
  `.claude/settings*.json`. Name the variable and where it is kept. No violation
  is known.
- **Adopted** — Local-only development credentials (localhost, no real data) may
  appear, and should say they are local-only.
- **Adopted** — **If a secret lands in a commit, rotate it first.** Then remove it
  from the tree and any copies, decide whether to rewrite history (hygiene, not
  the fix), check access logs for the exposure window, and add a
  `.gitleaksignore` entry only for a reviewed false positive.
- **Adopted** — Design for rotation: one place per credential, referenced by name.

## Private values: real prices and limits

Saroh's plan prices and limits are not secrets, but they are not the repo's
either: they live in the database, entered and published through the admin
console's Plans screen (`docs/architecture/PRICING_ROLLOUT.md`). Code, tests
and the seed use the sample catalogue in `@saroh/pricing-catalog/seed`,
whose numbers are made up.

`pnpm prepush` runs `scripts/check-private-terms.sh` (step `private`, never
cached). It fails when a tracked file matches one of the owner's private
values, read from `$SAROH_PRIVATE_TERMS` or
`~/.config/saroh/private-terms.txt` (one Perl-style regex per line). That
file lives only on the owner's machine, so the values it guards never reach
the repo through the check itself. Without it the step says SKIP, never PASS.
