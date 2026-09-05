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

Import from `@saroh/ui/data-state`. Do not hand-roll a dashed card.

| State   | Component               | Means                              | Says                                                   |
| ------- | ----------------------- | ---------------------------------- | ------------------------------------------------------ |
| ready   | `EmptyState`            | Nothing has happened yet           | "No X yet" + the action that would fill it             |
| off     | `CapabilityOffState`    | A capability is switched off (§21) | Which one, how to turn it on, that nothing was deleted |
| denied  | `PermissionDeniedState` | This person may not see it         | Explains; does not hide the surface                    |
| failed  | `FailedState`           | We could not find out              | "could not be loaded", offers retry, `role="alert"`    |
| partial | `PartialNotice`         | Some of it is missing              | What is MISSING, above the data that did arrive        |
| loading | `LoadingState`          | On its way                         | `aria-busy`, a label, sweep not pulse                  |

**"No X yet" belongs to `EmptyState` alone.** It is the only state where that
sentence is true.

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
- **A failed read is not an empty read.** `getList` throws rather than
  returning `[]` for exactly this reason (`lib/api/http.ts`).
- **A capability being off is not a failure.** It is not alarming, and it must
  say that nothing was deleted — a merchant who believes otherwise will never
  turn anything off again.
- **Denial explains rather than hides.** Hiding makes the workspace look broken
  to the person who cannot use it, and makes "ask someone who can" undiscoverable.
- **Test the distinction, not the styling.** See
  `packages/ui/src/components/ui/data-state.test.tsx`: the regression to guard
  against is someone reaching for `EmptyState` because it is closest to hand.
