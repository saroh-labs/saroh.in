# Contributing to Saroh

Thanks for looking. This is a small, part-time project, and contributions are
genuinely welcome.

## Before your first pull request

Read **[CLA.md](CLA.md)** and add the agreement line to your PR description. It
takes a minute and it is a one-time thing, not per pull request.

In short: **you keep your copyright**, and you give us permission to use your
work in Saroh — including in the commercial licences we sell to anyone running
it as a hosted service. Without that permission, a single contributed file can
block a commercial licence for the whole codebase. The reasoning is set out in
full in [CLA.md](CLA.md).

The clause worth checking before you agree: **if you are employed, many
employment contracts assign everything you write to your employer by default,
including work done on your own time.** Make sure yours does not, or get
permission first.

## Setting up

Full instructions are at
[docs.saroh.in/getting-started](https://docs.saroh.in/getting-started). The short
version:

```bash
pnpm install
cp apps/api.saroh.in/.env.example apps/api.saroh.in/.env   # fill in DATABASE_URL + BETTER_AUTH_SECRET
pnpm --filter @saroh/database db:migrate:deploy
pnpm --filter @saroh/database db:seed                      # demo@saroh.dev / demo-password-123
pnpm dev
```

Two things that will cost you an hour if nobody warns you, so consider yourself
warned — both are explained in the docs:

- `BETTER_AUTH_SECRET` is read at **import** time, so running the built output
  directly throws before it can tell you why.
- Better Auth's trusted origins exclude `localhost`, so every **write** returns
  403 while every read works. It looks like a permissions bug and is not.

## The checks

Run these before opening a PR. CI runs the same ones.

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm check:routes                 # every emitted href resolves to a real page
pnpm check:cycles                 # no circular imports
pnpm --filter @saroh/api test
```

### `testMatch` is an allowlist

`apps/api.saroh.in/jest.config.js` lists test paths explicitly. **A new spec file
runs zero times until its directory is added**, and Jest still reports success —
a green run with no coverage, which is worse than a red one. If you add tests
under a new module, add the path.

## Conventions

Full detail is at
[docs.saroh.in/contributing](https://docs.saroh.in/contributing). The ones that
catch people:

- **`api.saroh.in` is the only service that touches PostgreSQL.** If you find
  yourself importing `@saroh/database` in a Next.js app, the feature belongs
  behind an endpoint. This is what keeps tenant isolation checkable in one place.
- **`noUncheckedIndexedAccess` is off**, so `array[0]` types as present when it
  is not. Use `.at()` where an array can be empty.
- **`||` is not always a lint error.** `prefer-nullish-coalescing` will suggest
  `??` for `value?.trim() || null` — but `""` is not nullish, so `??` returns the
  empty string where `||` returned `null`. Running `eslint --fix` over that rule
  without reading the diff will silently change what your data means.
- **Colour comes from tokens, not variants.** `variant="default"` resolves to
  `--primary`, which in two of the three skins is the luminous action colour, so
  a "Overdue" badge ends up drawn like a success state. Semantic labels name
  their own token, and tinted states use the `*-subtle` pairs.
- **Contrast is measured, not eyeballed.** Composite every ancestor's alpha down
  to the page background — a `/10` tint over a card over a page is not the ratio
  the swatch suggests.

## Third-party code

If a contribution includes anything you did not write, say so in the PR and name
its licence.

**No GPL, AGPL or SSPL dependencies.** There are none anywhere in production
today, and that is deliberate rather than lucky: one would make it impossible to
license Saroh commercially at all, which is the thing that funds the time spent
on it.

## Branches and releases

Two long-lived branches, and one direction of travel:

```
feature branch  ──PR──▶  development  ──PR──▶  main
                                               (production release)
```

- **`development` is the integration branch.** Every feature, fix and doc change
  opens its pull request against `development`. Never against `main`.
- **`main` is the production release.** It only ever receives a pull request
  **from `development`**, and that PR is the release. Nothing lands on `main`
  any other way — no direct pushes, no feature branches, no hotfix shortcuts.
- **Branch names** describe the work and reference the issue where there is one:
  `fix/173-commerce-org-stamping`, `feat/175-csv-import`.
- **Merge commits**, not squashes, between branches — the history reads
  `merge(scope): what changed into development`, so a release PR shows the work
  that went into it rather than a flat list of squashed subjects.

A closing keyword (`Closes #123`) only fires against the repository's default
branch, so an issue referenced by a PR merged into `development` stays open
until the release reaches `main` — close it by hand when the work is done rather
than waiting for the release to do it.

## Commits and pull requests

Conventional commits — `feat(scope):`, `fix(scope):`, `docs(scope):`. Sign them:

```bash
git commit -s -m "feat(contacts): show open pipeline value on the list"
```

Explain **why** in the body. The diff already says what changed; what it cannot
say is what you were trying to fix and what you considered instead.

Husky runs `prettier` and `eslint --fix` on staged files, so formatting is not
something to spend review on.

## Reporting a security issue

Please do **not** open a public issue. Email <mohit@saroh.in> and give us a
chance to fix it first.

## A realistic note on response times

This is built alongside other work. Issues and pull requests may sit for a while
before they get proper attention — that is not disinterest, and a nudge after a
week or two is entirely fair.

If you are planning something substantial, open an issue first. It is much
better than finding out after you have written it that it does not fit.
