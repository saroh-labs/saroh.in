# Remaining work: a plan for the open issues

Written 2026-09-05, against `development` at `59dab9e`.

Stages 0–7 are built. 43 issues are open. This plan groups them by **what is
actually blocking them**, because the topic groupings in the tracker hide the
fact that a small number of infrastructure gaps account for most of the stalled
work.

## The finding that reorganised this plan

Four issues (#113, #120, #124, #117) are marked `⏳ Code` in
[`IMPLEMENTATION_BACKLOG.md`](../architecture/IMPLEMENTATION_BACKLOG.md): the
code is written and committed, and each is waiting only on verification against
a real Postgres. Three more (#121, #122, #125) have shipped slices whose
remaining step is browser verification against a running seeded stack.

So seven issues are not waiting on engineering judgement. They are waiting on
two pieces of test infrastructure that do not exist.

A third gap sat underneath #146: **no CI job ever executed a migration file.**
The integration suite builds its database with `prisma db push`, which reads
`schema.prisma` directly and skips the migration directory entirely. That is how
#146 shipped, and it is how a second, live drift bug shipped in #243.

## Phase 1 — Unblock (in progress)

### 1.1 Migration replay gate — DONE

`db:verify:replay` replays the whole chain into an empty database and diffs the
result against `schema.prisma`. Added as the `migration-replay` CI job.

Found and fixed a live bug in the process: `20260905000000_booking_outcome`
created `Booking_organizationId_outcome_endAt_idx` without declaring it in
`schema.prisma`, so the next `prisma migrate dev` would have generated a
migration dropping it. See the `saroh-migrations` skill.

#146 itself was already fixed by `eb6ce65` and never closed. Close it with the
replay evidence.

### 1.2 Verify the four coded issues

With Postgres available, run `pnpm --filter @saroh/api test:int` and land:

| Issue | What it needs                                                     |
| ----- | ----------------------------------------------------------------- |
| #113  | `OrganizationModule`/`ProjectModule` schema + idempotent backfill |
| #120  | `CustomerIdentityLink` + customer workspace API                   |
| #124  | `SavedView` + the safe `executeBulk` contract                     |
| #117  | `@RequireModule` enforcement guard + per-domain e2e matrix        |

Each is verified independently; a failure is a bug in that issue's code, not a
reason to hold the others.

### 1.3 Seeded-stack browser verification

The recurring deferred step across the cross-product UX epic. One harness
unblocks #121, #122, #125, #50 and #117's matrix. **This has no issue — file
one.**

## Phase 2 — Cheap, unblocked, independent

Neither touches the database or needs a running stack.

- **#139** — `authorize()` has zero production callers and `expire()` is
  unreachable, so the support-access audit ledger records a control the code
  does not enforce. False assurance in an audit is worse than no ledger.
- **#107** — delete the `sites/lib/fetchers.ts` null-stub still imported by two
  components; gate or fill `templates.saroh.in`.

## Phase 3 — The product bet

#177, #178 and #172 are one piece of work, not three. Each asks whether the
product holds up away from a desk:

- **#177** — loading, empty, partial, error, permission-denied,
  capability-unavailable, provider-disconnected and stale states as required
  product states, with a gate. `PRODUCT_STRATEGY.md` §30.
- **#178** — the six critical workflows designed for phone use rather than
  reflowed from desktop. §17.
- **#172** — the ledger prototype across four scenes: what a row carries, what
  is dropped as the viewport narrows, how an unpriced booking reads, and how an
  unlinked identity is rendered without claiming a link.

Pair with two skills — `saroh-product-states` and `saroh-four-scenes` — so the
standard is enforceable rather than aspirational.

## Phase 4 — Pre-launch infrastructure

- **#103** observability. Nothing is wired; a first production outage is silent.
- **#104** CD pipeline + `db:migrate:deploy`. A schema change reaching production
  currently depends on a human running migrations by hand.
- **#106** backup/restore rehearsal, load smoke, security review.

## Issues that do not exist yet

Six gaps found by reading `PRODUCT_STRATEGY.md`'s 36 sections against every open
and closed issue.

1. **Customer 360 action rail.** #120 delivers identity links and a read-only
   timeline. The actions §11 names — Message, Create sale, Add booking, Add
   note, Create follow-up — and the summary's lifetime value and next follow-up
   have no ticket.
2. **`docs.saroh.in` is 6 MDX pages** for a product with eight modules, a site
   editor and four operational hubs. Called materially stale in the 2026-07
   audit; never ticketed.
3. **`help.saroh.in` is 9 MDX pages.** Same gap, merchant-facing.
4. **Open signup.** `PRODUCT.md` says it is "gated on UX work" without naming
   which work, so the gate cannot be observed to lift.
5. **Seeded-stack CI harness.** Named as a dependency in seven places, tracked
   nowhere.
6. **No Saroh-specific agent skills.** `.agents/skills/` holds 20 generic
   skills; none encoded a single constraint of this codebase until
   `saroh-migrations`.

## Skills to add

Every constraint that causes rework here was unwritten, so it was re-derived or
violated each session.

| Skill                              | Encodes                                                            | Serves                  |
| ---------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| `saroh-migrations`                 | Replay from empty; migrations and datamodel must agree             | Done — #146, #243       |
| `saroh-product-states`             | §30 as a checklist with a gate                                     | #177                    |
| `saroh-four-scenes`                | 320/390/1440, no hover, contrast floor, dark first-class           | #178, #125, #172        |
| `saroh-architecture`               | Organization is tenant root; the API is the only DB-facing service | Boundary violations     |
| `saroh-module-capability`          | Capability-gated endpoints and nav; the 4-gate availability model  | #117 and future modules |
| `nestjs-prisma-org-scoped-service` | Service + policy + RLS + `test:int` pattern                        | Every API module        |
| `agent-browser-verification`       | The recurring browser-verify step, made runnable                   | Phase 1.3               |
| `saroh-issue-writing`              | §32 hygiene, §34 major-proposal format                             | Issue quality           |

## Working agreement for this batch

Each change is its own branch, merged into **local** `development` as it
completes. Nothing is pushed to origin until the whole batch has been reviewed.
