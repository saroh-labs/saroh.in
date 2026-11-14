# Releasing a feature: AI apps, Share, Ask AI, the API

> **Read when:** turning on AI apps, Share and posts, Ask AI or the API
> and webhooks in production, writing the release commit for one, or
> submitting Saroh to an AI app's directory. Plan:
> `docs/plans/2026-11-13-002-feat-release-visibility-plan.md` (U15).
> Background: `DEPLOY_ROLLBACK_INCIDENT.md`, `MODULE_ROLLOUT.md`,
> `docs/patterns/devops-environments-and-flags.md`.

Every public piece of a feature (its feature page, Integrations entries,
help articles, changelog entry, pricing rows, trade-page lines and the
nav, sitemap and llms lines) reads one saroh.in switch,
`NEXT_PUBLIC_<FEATURE>`, and is built only while it is on. So a release is
one switch and one deploy, after one release commit.

This page names no price, plan limit, date, host or private note: the
repository is public. Values live in the admin console, on the host and in
the operator's notes.

| Feature          | saroh.in switch          | Release check key | App and API switches                                                         |
| ---------------- | ------------------------ | ----------------- | ---------------------------------------------------------------------------- |
| AI apps          | `NEXT_PUBLIC_AI_APPS`    | `ai-apps`         | `API_MCP` flag; `NEXT_PUBLIC_API_AREA` (app)                                 |
| Share and posts  | `NEXT_PUBLIC_SOCIAL`     | `social`          | `SHARE_POSTS` (API env); `NEXT_PUBLIC_SHARE_POSTS` (app)                     |
| Ask AI           | `NEXT_PUBLIC_ASK_AI`     | `ask-ai`          | Ask AI's own switches (plan 2026-11-13-001)                                  |
| API and webhooks | `NEXT_PUBLIC_DEVELOPERS` | `developers`      | `API_SECRET`, `API_STOREFRONT`, `API_WEBHOOKS` flags; `NEXT_PUBLIC_API_AREA` |
| Docs site        | `NEXT_PUBLIC_DOCS`       | `docs`            | none: says docs.saroh.in answers                                             |
| Templates        | `NEXT_PUBLIC_TEMPLATES`  | `templates`       | `SITE_TEMPLATE_CHOICE` flag (DEC-135, DEC-216)                               |

## The release check

```bash
pnpm check:feature-release                        # production's switches (runs in prepush and CI)
node scripts/check-feature-release.mjs --feature ai-apps   # as if ai-apps were on
node scripts/check-feature-release.mjs --env dev           # the dev environment's switches
```

It reads repo files only, never the network. For each switch on it fails
when:

- a page, help article or changelog entry gated on it is missing, or the
  changelog entry is still in `WAITING_ENTRIES`;
- a feature-page shot or a help step's shot is a placeholder (not in
  `apps/saroh.in/content/shots.captured.ts`; a drawn chat or panel needs
  none);
- `docs/architecture/MARKETING_CLAIMS.md` §17 has no rows for it, or one
  row is **Not backed**;
- the app's `HELP_ARTICLES` still has an entry that `waitsFor` it;
- `developers` is on while `docs` is off;
- `README.md` has no section for it yet (AI apps, Ask AI, Share, Developers).

Whatever is on, it also fails when a changelog entry, help article or
Resources page behind an off switch carries a future `publishOn` (legal
pages publish by date and are exempt), when an offered AI app
(`liveOnDev: true`) has no help anchor, or when saroh.in's and the app's
lists disagree on which apps are offered.

**Run `--feature <key>` before the release commit, and again on it.** It
must pass before step 2 below.

## 1. Before: the release commit

One commit on the batch branch, for one feature, after the owner's go:

1. **Changelog.** Move the feature's entry from `WAITING_ENTRIES` to
   `CHANGELOG_ENTRIES` in `apps/saroh.in/content/changelog.ts`, with
   `publishOn` set to the release day and its `waitsFor` kept. No earlier
   commit carries that day.
2. **The app's help links.** Drop `waitsFor` from that feature's entries in
   `HELP_ARTICLES` (`apps/app.saroh.in/lib/help/links.ts`), so the command
   menu links them.
3. **Shots.** Capture every placeholder the check names
   (`e2e/marketing-shots/`, `shots.config.ts`), then read each shot
   against its page's claims (DEV_LEARNINGS, 4 Nov):
    - feature pages: `AI_APPS_SHOTS` (consent, AI activity) and
      `SHARE_SHOTS` (Share sheet, button, card styles, phone, Create post);
      Ask AI's five wait for its screens;
    - help: the 26 pending `help-*` keys (connect Claude, connect ChatGPT,
      other AI apps, Ask AI, share a post, API keys and webhooks) have no
      capture specs yet. Each needs a `HELP_SHOTS` entry, with a `mark`
      where its step names a control.
4. **AI apps offered.** After each app's dev sign-in walk, set its
   `liveOnDev: true` in both `apps/saroh.in/content/integrations.ts` and
   `apps/app.saroh.in/lib/ai-connections/mcp-address.ts` (`AI_APPS`), and
   correct its menu path (`CONNECT_IN`, its page and help) to what the walk
   saw. An app not walked stays off.
5. **Claims.** Re-read the feature's §17 rows against what ships; a row
   that is Not backed is fixed in the code or dropped from the words.
6. **Legal.** For AI apps and Ask AI, the owner-approved clauses (plan
   U12) go in with the same commit, `publishOn` moved to the release day.
7. **README.** Add the feature's section to `README.md` in the same
   commit: "From your AI assistant" (with the MCP address), "Ask AI",
   "Share and posts", or "Build on Saroh" (API keys, webhooks, a link to
   the docs). The README is public the day it merges, so it never names a
   feature before its switch is on. At the Global launch, the headline and
   the opening paragraph name both editions, saroh.in and saroh.tech.
8. Run `pnpm prepush`, then the check with `--feature <key>`.

## 2. Release, per feature (owner)

1. **API.** Turn the feature's API flag on in the production admin
   console (table above), or the API env for Share.
2. **The app.** Its switch on in `apps/app.saroh.in/wrangler.jsonc`
   production vars, if not already.
3. **saroh.in.** Add `"NEXT_PUBLIC_<FEATURE>": "on"` to `env.production.vars`
   in `apps/saroh.in/wrangler.jsonc` (the comment there lists each). Merge
   to main with the release.
4. **Deploy.** The owner runs `deploy-frontends` with app `web`,
   environment `production` (and `application` when the app's switch
   changed). Nothing deploys on a schedule.
5. **Production check.** The feature page, its help articles, its
   Integrations entries, the changelog entry, the home grid and nav count,
   the pricing row and the /for/ pages' new lines show; with the switch off
   they did not. Sign in from each offered AI app once against production.
6. **Day 1.** The email to businesses, the social posts and the demo film.

Roll back by removing the switch from production vars and redeploying
`web`; the API flag goes off in the admin console.

## 3. The docs site and /developers

1. Deploy docs.saroh.in: `deploy-frontends` with app `docs`, environment
   `production`. The docs deploy wiring reaches main with the release PR.
2. Once docs.saroh.in answers, add `"NEXT_PUBLIC_DOCS": "on"` and deploy
   `web`. Docs links on saroh.in render only from then.
3. Only then `"NEXT_PUBLIC_DEVELOPERS": "on"`: the check refuses
   `developers` while `docs` is off.

docs.saroh.tech (`docs-global`) goes up at the Global launch step
(`GLOBAL_LAUNCH.md`).

## 4. The pricing catalogue (owner, admin)

The repo holds only words; the lines, allowances and compare group are
catalogue data, entered in admin and published there:

- card lines: "Use Saroh from your AI assistant" and "Share and posts" on
  every plan; "Ask AI" on paying plans; "API keys and webhooks" on paid
  plans;
- the "AI and connections" compare group;
- usage module ids `ask-ai-questions` and `api-requests` (the pricing
  page's rows, dropped while their switch is off), and the module id
  `ask-ai` for Ask AI's line.

Admin can be filled in before release: a row for a switched-off feature is
not shown.

## 5. AI app directories

**Claude first, at the AI apps release.** Submit once all of these are
true:

- Privacy and Terms with the AI apps clauses are published (plan U12);
- the Claude setup page (`/integrations/claude`) is live;
- a public support address is on the listing;
- production sign-in has been tested from Claude and ChatGPT;
- the "Saroh Review" business exists, with a reviewer login that signs in
  by password.

**ChatGPT after Claude's listing**, once the OpenAI organisation is
verified. Gemini app, Gemini Enterprise and Microsoft 365 Copilot are later
work: they need pre-issued client IDs and a client secret at registration.

## Open gaps (block a release until closed)

- **AI activity kept 90 days.** The pages, help and the legal draft say AI
  activity is kept for 90 days, but nothing deletes `McpActivity` rows: the
  daily sweep only ends connections idle for 90 days. Claims row AA8 is Not
  backed, so the check refuses `ai-apps`. Fix: a pruning job, or drop the
  words.
- **The "Add a connector" step needs a drawn panel.** `ai-connect` on the
  AI apps page is another company's form and can't be captured: draw it as
  a panel (as help's drawn panels do), so the step needs no shot.
- **Ask AI** is refused until its screens and API land (plan
  2026-11-13-001) and §17.2's rows are read against them.
