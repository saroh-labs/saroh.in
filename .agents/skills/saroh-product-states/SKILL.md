---
name: saroh-product-states
description: Use when a surface can be empty, loading, partial, failed, permission-denied, or gated by a capability — i.e. any screen that reads data
---

# Saroh Product States

## Overview

`PRODUCT_STRATEGY.md` §30: "These states are part of the product. Do not treat
them as edge cases to be designed later."

**Core principle:** a merchant must be able to tell, without asking support,
_why_ a screen has nothing on it. An ambiguous empty state is the most common
way a product lies — it reports "nothing to do" when the truth is "we could not
find out", and on a shop floor the merchant acts on that difference.

## The named set

Import from `@saroh/ui/data-state`. Do not hand-roll a dashed card, a red line
or a sentence of your own: `components/shared/states-scan.test.ts` fails on
them.

| State         | Component                      | Means                                | Says                                                                                  |
| ------------- | ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------- |
| ready         | `EmptyState`                   | Nothing has happened yet             | "No {things} yet", one sentence, the action                                           |
| no results    | `EmptyState kind="no-results"` | A search, filter or tab left nothing | "No {things} match “q”", Clear search / Clear filters / Show all {things}             |
| off           | `ModuleOffState`               | A module is switched off (§21)       | "{Module} is turned off", "Nothing is deleted. Turn it on to bring it back.", the way |
| plan          | `PlanLockedState`              | The plan leaves it out               | "{Thing} comes with {Plan}", `planLabel` ("See Grow" or "See plans")                  |
| limit         | `LimitReachedState`            | The plan has it, and it is all used  | "You're at {n} of {n} {things}", what makes room, `planLabel`                         |
| not connected | `ProviderDisconnectedState`    | No payment or email provider         | "No payment provider connected", "Connect in Providers"                               |
| not published | `NotPublishedNotice`           | The website isn't live               | "Your website isn't live yet.", "Go to Website"                                       |
| denied        | `PermissionDeniedState`        | This person's role does not reach it | `whoCanChange()`: "You can't open {thing}", the role, who can change it               |
| paused        | `PausedState`                  | The plan's team limit set them aside | "Your access to {business} is paused", the owner and the plan. Never "no access"      |
| signed out    | `SignedOutState`               | The session ran out                  | "Your session has ended", "Sign in again to pick up where you left off.", Sign in     |
| failed        | `FailedState`                  | We could not find out                | "Couldn't load {things}", "Nothing has been changed.", Try again, `role="alert"`      |
| partial       | `PartialNotice`                | Some of it is missing                | What is MISSING, above the data that did arrive                                       |
| loading       | `LoadingState`                 | On its way                           | `aria-busy`, a label, sweep not pulse                                                 |

**"No X yet" belongs to `EmptyState` alone.** It is the only state where that
sentence is true.

### Three sizes, one look each

Every card takes `size`:

- `page`: the state is the page's body. Icon, 19px title, one sentence, the
  action.
- `panel`: a tab or a card inside a page. Smaller, icon optional.
- `inline`: one line with an optional text action, for a sheet section, a
  picker or a row. No box.

`DataView` renders `EmptyState` for its three empties, so a list passes
`noun` and `emptyState` and never draws one.

### The sentences are written once

`@saroh/ui/lib/state-copy`: `couldntLoad(things)`, `nothingChanged(reassurance?)`,
`backTo(place)`, `noMatchLine(things, q)`, `planLabel(plan?)`, and the off,
plan, paused, signed-out, not-connected and not-published words. A denial's
are `whoCanChange()` (`lib/access/who-can-change.ts`). A screen passes what it
knows ("invoices", "Every invoice that was issued is still there.") and never
a sentence.

### First run

A page-size first-run state has an icon, the title "No {things} yet", ONE
plain sentence saying what will show here or what to do, and the action a
person with permission would take, labelled exactly as the page header's
primary ("New {thing}", no plus icon). Where the person may not create, there
is no button and the sentence does not promise one.

### Failed means Try again reads again

- `FailedState` takes `onRetry` (a boundary's `retry`, a hook's refetch,
  `router.refresh()`) or `retryHref`. Never "reload the page".
- A part of a page the server couldn't read is `FailedRead`
  (`components/shared/failed-read.tsx`): one line, Try again refreshes the
  page's reads and leaves the rest of the screen where it was.
- Every `error.tsx` renders `SectionError` with `retry` (Next 16.3: it
  refetches; `reset` only redraws), the page's `heading`, `things`, an
  optional `reassurance`, and the menu's name for the way back.

## The rule that matters most

**Distinguish by shape, semantics AND wording — never by colour alone** (§19).

- Bright ambient light is one of four primary scenes; colour resolves last.
- The phone and shop floor have no hover, so nothing may be explained by a
  tooltip.
- A screen reader hears `role="alert"` vs `role="status"` vs nothing.

A `FailedState` that looks like an `EmptyState` with a red icon has failed the
requirement.

## The API has to express it first

The client cannot render a difference the API does not send. A surface that
aggregates several reads must degrade per source, not all-or-nothing:

```ts
// apps/api.saroh.in/src/modules/home/home.service.ts
const unavailable: HomeUnavailable[] = [];
const open = await this.attempt(
    { moduleKey: "COMMERCE", label: "Open orders" },
    () => this.openOrders(organizationId),
    { count: 0, evidence: [] },
    unavailable,
);
```

Home used to await its sources unguarded. One failing source threw out of
`build()` and the merchant got the segment error boundary — no actions, no
schedule, no numbers, including every part that had answered fine. Home is
where the decision about what to do next is made; "everything is broken" was
both untrue and the least useful thing to say.

**A failed source must never become a zero.** When open orders could not be
read, the "Open orders" tile disappears and the notice names it. It does not
render `0`, and it does not emit a suggestion ("Add a product to your catalog")
that assumes an empty catalogue.

## Verify it, do not reason about it

Break the source and look:

```bash
psql -d <scratch db> -c 'ALTER TABLE "Order" RENAME TO "Order_tmp_broken";'
# load the page, confirm the notice names it and the rest still renders
psql -d <scratch db> -c 'ALTER TABLE "Order_tmp_broken" RENAME TO "Order";'
```

Check all four scenes ([[saroh-four-scenes]]), including dark.

## Rules

- **Never `catch {}` a user-facing read.** Either it degrades into a named
  state, or it throws to the segment boundary. Silence is the bug.
- **An api that could not be asked is not a signed-out user.** The session is
  a read like any other, and "no session" and "could not find out" are
  different states. `resolveServerSession()` keeps them apart; only a 401/403
  may send someone to sign-in, and anything else throws to the segment
  boundary so it offers a retry. One restart used to sign everyone out
  (`packages/auth/src/next.ts`).
- **A failed read is not an empty read.** `getList` throws rather than
  returning `[]` for exactly this reason (`lib/api/http.ts`).
- **A module being off is not a failure.** It is not alarming, and it must
  say that nothing is deleted. A merchant who believes otherwise will never
  turn anything off again. Someone who can't turn it on reads who can, as
  text, never a button to a switch they can't press. The same for a plan:
  someone who can't change it gets text, not a link.
- **Off, plan and limit are three states.** "Turned off" has a switch, "comes
  with a plan" has a plan, "limit reached" has room to make. Each has its own
  icon and one sentence.
- **Denial explains rather than hides.** Hiding makes the business look broken
  to the person who cannot use it, and makes "ask someone who can" undiscoverable.
  `PermissionDeniedState` is the only card for it: never `EmptyState` with a
  lock, never the red card. A paused member and a session that ran out are
  their own states.
- **Test the distinction, not the styling.** See
  `packages/ui/src/components/ui/data-state.test.tsx`: the regression to guard
  against is someone reaching for `EmptyState` because it is closest to hand.
