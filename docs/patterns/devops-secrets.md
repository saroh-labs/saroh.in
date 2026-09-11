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
