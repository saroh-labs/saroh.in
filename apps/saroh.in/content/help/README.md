# Help articles

One article is one file, `content/help/<slug>.mdx`, served at
`/help/<slug>` (Resources plan U5, design "Saroh Resources - Help" 2a). The
steps live in the YAML frontmatter; the MDX body under it is optional prose
shown before the steps (most articles leave it empty). The shape and rules
are `content/help.ts`; `lib/help-docs.ts` reads the files and the build fails
on anything wrong (`helpErrors` in `content/validate.ts`).

## Frontmatter

```yaml
title: Connect Razorpay # the H1, and the link everywhere
slug: connect-razorpay # must equal the file name
area: Payments # side nav: one of HELP_AREAS
group: Get paid # home's task group: one of HELP_GROUPS
order: 10 # place in its group and area (lower first)
intro: "…" # first paragraph: what it is, how long it takes
description: "…" # meta and share line, at most 170 characters
readMinutes: 3
updated: "2026-10-08" # the day its words or shots last changed (R20)
publishOn: "2026-10-17" # optional; Help's day by default (KTD-2)
steps:
    - title: Open Settings › Providers
      body: "…what to do, naming each control as the app labels it…"
      shot: help-connect-razorpay-1 # a captured key, required
      caption: "…what the picture shows, naming the demo business…"
      tip: "…" # optional, only where needed
      marker: Connect # optional: the control ringed in Saffron
next: [connect-cashfree] # up to three slugs, published no later than this one
```

Cite where each label comes from in YAML comments at the top, as
`add-your-first-product.mdx` does.

The build fails if a step's `shot` is not captured, a `marker` is set on a
shot captured without a `mark`, a `next` slug is missing, the article itself,
or publishes later, the area or group is unknown, or any text names a price, a
plan limit or a plan ("₹", "up to 5", "Free plan": DEC-078).

The home lists only published articles, and hides a group with none. Before
an article's `publishOn` day in India it is a 404 and linked nowhere; set
`RESOURCES_PREVIEW=1` to see it locally or on a preview.

## Screenshots

Each step's picture is a real capture of the app on a demo business, never a
drawing (KTD-6). Add one entry per step to `HELP_SHOTS` in
`e2e/marketing-shots/shots.config.ts`, keyed `help-<slug>-<n>`:

- `route` and `business`: Rye & Co., Pulse Fitness and Kavi Dental are
  look-only; a shot that needs a write first takes it on Northwind.
  `accounts:/signup` is the accounts app; sign-up and setup shots open no
  business;
- `role`: `owner` (the demo owner) for most; `founder` (Asha, whose
  Asha's Bakery has nothing turned on yet); `visitor`, signed out; and
  `newcomer`, an account with no business. The seed has no such account,
  so before capturing a `newcomer` shot, sign up as `new.owner@saroh.dev`
  with `demo-password-123` on your stack (the code is printed in the API's
  log, `(no SMTP) … code`) and stop at Set up Saroh;
- `viewport`: `HELP_DESK` (1024 wide) for a whole screen, or a `clip` around
  one section (`selector`, optional `until`, `pad`), so it reads at about its
  real size in the 680px column;
- `steps`: `click`, `waitFor`, `hide`, or `fill` a form that is never
  submitted. Never click a button that saves;
- `mark`: a selector for the control the step names; the capture records its
  box and the article rings it;
- `alt`: what the image shows, naming the business as a demo.

Then, against a local stack on a fresh throwaway database seeded with the
showcase (`docs/architecture/LOCAL_DEV.md`;
`DATABASE_TARGET_CONFIRM=<db> pnpm --filter @saroh/database db:seed:showcase`):

```bash
pnpm --filter @saroh/e2e shots help-connect-razorpay-1 help-connect-razorpay-2
```

It writes `public/shots/help/<key>.webp` and rewrites
`content/shots.captured.ts` (with each shot's `mark`). The `E2E_*_URL`
variables point it at a bare-port stack; by default it uses the portless
hostnames. Look at every image before committing it.

## Before it merges (R7)

Every label, button, field and path the article names is checked against the
real screen, in the code and in the capture. Where the design's words and the
app differ, the app wins: rewrite the words, and say why in a YAML comment.
Then run `pnpm --filter web test` and `e2e/tests/help.spec.ts` with
`RESOURCES_PREVIEW=1`.

## Pointing articles at each other

When a new article lands, add it to `next` of the articles that should point
at it. The first article's design also named "Add sizes and options" and
"Count and move stock", which aren't written yet.

A link in an article's MDX body (the prose before the steps) is drawn as a
link: the payment articles point at their integration page that way.
