# Sales: the ledger

**Status:** locked spec. Ready to hand to an implementation plan.
**Answers:** #165, #166, #169, #170, #171. Charted by #163; prototype in #172.
**Constitution:** `docs/PRODUCT_STRATEGY.md` §13, §18, §19, §20, §21, §30, §31.

Sales is an always-present, org-scoped operational view **derived over `Order`
and `Booking`**, keyed on one customer identity, operational-first. It is a
query, not a record: no migration of `Order` or `Booking`, and disabling a
source hides a surface and destroys nothing.

Everything below is decided against the code as it stands on `development`, not
against the roadmap. Where the code contradicts a document, the code is quoted.

---

## 1. The vocabulary (#165)

### What actually feeds the column

| Source                | States                                                        | Where                                                   |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| `Order.status`        | `PENDING → PROCESSING → SHIPPED → DELIVERED`, or `CANCELLED`  | `orders/order-state.ts`                                 |
| `Order.paymentStatus` | `UNPAID → PAID \| FAILED`, `FAILED → PAID`, `PAID → REFUNDED` | same file                                               |
| `Booking.status`      | `PENDING → CONFIRMED → CANCELLED`                             | `schema.prisma` (default is `CONFIRMED`, not `PENDING`) |

Three facts the mapping has to survive:

- All three are **free-form `String` columns**, narrowed in DTOs. There are no
  Prisma enums to lean on, so the ledger must treat an unrecognised value as a
  real possibility rather than an impossible one.
- **A booking has no payment axis at all.** No `paymentStatus`, no amount, no
  currency. Payment is _absent_ from that half of the ledger, not unpaid.
- **A booking has no amount column either.** Price lives on `Service.priceCents`
  (`Int?`) with `Service.currency` (`String?`), captured into the immutable
  `Booking.snapshot` at booking time. A service may be genuinely unpriced.

### Decision: two independent signals, not one merged word

The ledger carries **one status word per row**, and payment is **a separate
signal that renders only on rows that have one**. Folding payment into the
status word would require inventing a payment state for every booking, which is
the "say what is true" violation in its purest form.

**The words.** Nine source states map onto six merchant-facing words:

| Source state                                   | Ledger word             |
| ---------------------------------------------- | ----------------------- |
| `Order` `PENDING`                              | To do                   |
| `Order` `PROCESSING`                           | In progress             |
| `Order` `SHIPPED`                              | On its way              |
| `Order` `DELIVERED`                            | Done                    |
| `Order` `CANCELLED`                            | Cancelled               |
| `Booking` `PENDING`                            | To confirm              |
| `Booking` `CONFIRMED`, `startAt` in the future | Booked                  |
| `Booking` `CONFIRMED`, `startAt` in the past   | Done                    |
| `Booking` `CANCELLED`                          | Cancelled               |
| anything unrecognised                          | the raw value, verbatim |

**Is it lossy?** The mapping is **injective within a source**, which is the
property that matters. "Done" covers `DELIVERED` and a past `CONFIRMED`, but
those rows are never the same kind of thing and the row itself says which — a
merchant is not being asked to distinguish them from the word alone. No two
states _of the same source_ share a word, so no distinction the merchant acts on
inside one source is hidden.

**The unrecognised case is rendered, not swallowed.** A status the ledger does
not know is shown as written rather than mapped to "Done" or dropped from the
list. A free-form column will eventually hold something this table does not
list, and a ledger that quietly reclassifies it is lying about a sale.

### Payment as a second signal

Payment renders **only for rows that have a payment axis** — orders. On a
booking row, the payment slot is not empty, it does not exist: no "Unpaid" chip,
no dash, no column. This is exactly the failure #168 found Wix conceding in its
own documentation, and it is the failure to avoid.

For orders:

| `paymentStatus` | Renders                                                    |
| --------------- | ---------------------------------------------------------- |
| `PAID`          | the amount, unmarked                                       |
| `UNPAID`        | the amount + an explicit "Unpaid" marker                   |
| `FAILED`        | the amount + "Payment failed" — this is an attention state |
| `REFUNDED`      | the amount + "Refunded"                                    |

`PAID` is deliberately the quiet one. It is the expected end state, and marking
it spends the merchant's attention on the rows that need none.

### The absent amount

An unpriced booking renders the word **"No price"**, never `0` and never a blank
cell. `0` is a real amount a merchant can legitimately charge, so rendering an
absent price as zero destroys a distinction rather than simplifying one.

Resolution order for a booking's amount: `Booking.snapshot` price → nothing. The
snapshot is authoritative because it is immutable and `Service.priceCents` can
change after the booking was taken; reading the live service would restate
history. A booking taken while the service was unpriced stays unpriced for ever,
which is correct.

**No cross-surface revenue total in v1** (Decision 4). A total over a list where
some rows honestly have no amount is a number with no meaning.

### Which states mean "needs attention"

`information-architecture.md:161` already writes "3 orders awaiting fulfilment"
into Home, and Home ranks ATTENTION before OVERDUE before SETUP.

**Attention** = `Order` `PENDING`, `Order` `PROCESSING`, `Order.paymentStatus`
`FAILED`, `Booking` `PENDING`.

Not attention: a future `CONFIRMED` booking (that is "Coming up", a different
Home section), `UNPAID` on its own (an unpaid order that has not shipped is
ordinary trade, not a problem), and every terminal state.

### The shop-floor constraint

Read in bright light, at a glance, by someone holding something else. So:

- The word is the signal. Colour is reinforcement, never the carrier (§19: no
  reliance on colour alone).
- One word per row, not a phrase. "On its way", not "Shipped, awaiting delivery".
- Contrast materially above 4.5:1, not at it.

---

## 2. Identity (#166)

### The shapes do not match

|            | `Contact` (CRM, bookings)                     | `Customer` (commerce, orders)          |
| ---------- | --------------------------------------------- | -------------------------------------- |
| Tenant key | `organizationId` **NOT NULL**                 | `organizationId` **nullable**          |
| Email      | required, `@@unique([organizationId, email])` | required, `@@unique([storeId, email])` |
| Phone      | `String?`                                     | `String?`                              |

`CustomerIdentityLink` exists and carries `linkedByUserId String` — **not
nullable**. Nothing links automatically today.

### Decision: normalised email only

**The key is `email.trim().toLowerCase()`. Nothing else.**

- **Not phone.** Nullable on both models, free-form, and there is no phone
  normalisation anywhere in the codebase. Keying on an unnormalised phone string
  is not matching, it is guessing.
- **Not plus-aliases, not dot-stripping.** `a+shop@x.com` and `a@x.com` are the
  same mailbox at some providers and different people at others. The asymmetry
  decides it: **over-merging is a privacy event — one person seeing another's
  purchase history — and under-merging is an inconvenience.** Where the two
  errors cost that differently, the conservative rule wins.

**Multi-store is not a conflict.** `@@unique([contactId, customerId])` is a pair,
so one `Contact` may hold links to several `Customer` rows — one per store — and
that is the correct outcome for a person who bought from two of a merchant's
shops. A second store's `Customer` links independently of the first.

**Cross-org safety.** `Customer.organizationId` is nullable, so a `Customer` may
not name an org at all. The linker resolves the org as
`Customer.organizationId ?? Store.organizationId` and links **only** when that
resolves and equals the `Contact.organizationId`. If the org cannot be resolved,
no link is written. A tenant boundary is not somewhere to be optimistic.

### When it runs

**Both, through one function.** A single pure `resolveIdentityLink()` is called
on order and booking write, and the same function drives a backfill job. On-write
keeps the ledger true going forward; the backfill makes existing rows true. Two
implementations would be two answers, and this one decides who sees whose
purchases.

Staged as `implementation-backlog.md:172` has it: backfill → require →
auto-link on write → _only then_ consider collapsing models.

### Telling an automatic link from a human one

`linkedByUserId` is **not sufficient** — it is a non-nullable `String`, so an
automatic link would have to invent a user id, which puts a lie in an audit
field and makes a wrong auto-link indistinguishable from a person's mistake.

Additive migration:

- `linkedByUserId` becomes **nullable**
- new `linkedBy String` — `"USER"` | `"AUTO_EMAIL"`; existing rows backfill to
  `"USER"`
- new `unlinkedAt DateTime?` and `unlinkedByUserId String?`

### Reversal

Unlinking **soft-deletes** the link rather than removing the row, and the
auto-linker **never recreates a link that carries `unlinkedAt`**. Without that
suppression the merchant's correction is undone by the customer's next order —
the wrong link returns, silently, and the privacy event repeats. A hard delete
cannot carry that memory, which is why the row stays.

Both the link and the unlink are audit events.

### The unlinkable row

A walk-in order may carry neither a real email nor a phone. The ledger renders
**what the row itself captured** — `Customer` name/email for an order,
`Booking.bookerName`/`bookerEmail` or the linked `Contact` for a booking — and
claims nothing further.

What it must not do:

- **Never silently merge.** Two rows with no proven link are two rows, even when
  the names match.
- **Never silently split.** Where two rows _are_ linked, they carry the same
  customer identity and say so.
- **Never assert similarity as sameness.** Where two unlinked rows share a
  display name, the ledger does not surface a "possible match" claim in v1.
  Suggesting a merge is a feature with its own privacy design, and it is not
  this one.

---

## 3. Gating (#169)

### The permission to read Sales: no new action

Sales requires **`order:read` OR `booking:read`**, and **each arm is gated by
its own action**. There is no `sales:read`.

A single new action could only be broader than one arm (leaking orders to
someone holding `booking:read` alone) or narrower (hiding a source from someone
entitled to it). Per-arm gating is the only shape that cannot leak, and both
actions already exist in `ORG_ACTIONS`, which the registry validator requires.

A merchant holding neither sees Sales as a permission-denied state, not as an
empty ledger (§30 lists permission denial as its own designed state).

### What Commerce's `requiredAction` becomes

`module-registry.ts:146` gates Commerce on `requiredAction: "order:read"` — the
registry treats _reading orders_ as the defining privilege of Commerce. With
Sales reading orders from outside Commerce, that gate now does two jobs.

**Recommended: add `catalog:read` to `ORG_ACTIONS` and gate Commerce on it.**
Commerce is described in its own descriptor as "Catalog, inventory, carts, and
orders for selling products" — the catalog is the thing it is, and there is no
catalog action today. Adding one forces every role to make an explicit
allow/deny decision, because `CAPABILITIES` is keyed by the union and TypeScript
will not let a new member pass silently. Grant it to OWNER/ADMIN — **exactly
today's audience**, since `order:read` is not in `READ_ONLY_ACTIONS` either, so
no merchant gains or loses Commerce.

Considered and rejected:

- **`store:read`** — it _is_ in `READ_ONLY_ACTIONS`, so this silently widens
  Commerce to every MEMBER. A visibility change disguised as a rename.
- **`store:write`** — right audience, wrong meaning: a write action as a
  visibility gate reads as a mistake at every future call site.

### Per-arm gating is the gate

The read model issues one query per source and **skips an arm whose module is
disabled** — that is the gate, server-side, in the read model.

A row written while a module was enabled **still exists** after it is disabled
(Decision 3 destroys nothing). It does not appear while the arm is off, and the
ledger **says the arm is off** rather than quietly returning a shorter list. A
ledger that under-reports without saying so is worse than one that refuses.

### Server enforcement, not navigation

Public §21: "Capability-aware UX must be backed by capability-aware server
enforcement. Hiding a navigation item is not security."

**#169 states that `@RequireModule` is applied to zero controllers repo-wide.
That was true when it was written and is not true now.** Six controllers wear
`@RequireModule("COMMERCE")` behind `ModuleEnforcementGuard`:
`customers`, `products`, `product-details`, `imports`, `orders` and
`categories`.

The real asymmetry is worse than the one the ticket describes, and it lands
squarely on this spec: **nothing wears `@RequireModule("APPOINTMENTS")`.**
`bookings.controller.ts:41` carries `BetterAuthGuard, OrganizationGuard` and no
module enforcement at all. So Sales' order arm inherits a gate that is really
enforced, and its booking arm inherits one that is not.

**Sales is therefore specified as requiring the booking half of that wiring**,
and the implementation plan owns it: `bookings.controller.ts` gains
`ModuleEnforcementGuard` + `@RequireModule("APPOINTMENTS")` in the same tranche
as the Sales read model. Specifying Sales as inheriting the existing gate would
document a protection that exists on one arm and not the other — and the arm
without it is the one an Appointments-only merchant lives in.

---

## 4. What Sales shows when its sources are off, empty or unhealthy (#170)

Five states, five renders. The distinction is the product.

**1 — Neither Commerce nor Appointments enabled.** Sales stays in the
navigation: §20 lists it unconditionally, and §21's "no dead screens" is
satisfied by the screen doing real work rather than by the entry disappearing.
It names the two things that feed it and links to Settings → Modules. One
sentence, one action.

**2 — Sources enabled, nothing sold yet.** A _working_ empty ledger, and the
first thing a new merchant sees. First-run copy, not an error, not an apology.
Structure visible so the merchant can see what will appear.

**3 — One source only.** The vocabulary narrows to that source, everywhere:
columns, filters, empty copy, the status words in §1. An Appointments-only
merchant meets no fulfilment word anywhere in Sales — and a Commerce-only
merchant meets no booking word. Derived from which arms are live, never
hardcoded.

**4 — A source present but unhealthy.** The ledger renders what it has **and
says which arm failed**, with retry. Partial data is a designed state (§30) and
must never render as empty: "you have sold nothing" and "we could not read your
bookings" are opposite facts, and the merchant's next move differs.

**5 — Rows from a since-disabled module.** Not shown while the module is off,
and the state line says so. Never silently dropped.

The standing constraint decides all five: **a surface that is
configured-but-broken says so, rather than rendering as merely empty.**

---

## 5. Placement, and which document is wrong (#171)

### Placement

`docs/PRODUCT_STRATEGY.md` §20 lists **Sales** ("Things the business sold") and
**Products** as separate top-level destinations. Sales carries no qualifier;
Bookings carries "When relevant".

Sales sits in the **"Run the business"** group of `NAV_GROUPS`, above the
per-source destinations.

**A collision the placement question has to settle.** The rail already carries
an item labelled **"Sell"** pointing at `/commerce`, which today holds orders
_and_ catalog behind a store picker. Two destinations cannot both be the place
you go to see what you sold. The resolution follows §20: **`/sales` is "Sales"
(the cross-source ledger) and `/commerce`'s item becomes "Products" (the
catalog)** — which is §20's own pair of words, and it stops the rail offering
the merchant two answers to one question.

### The fate of `stores/[storeId]/orders`

**It survives**, as Commerce's per-store view beneath a cross-source Sales. It
is not replaced: store-scoped fulfilment work is real, and a derived view is not
a record. What it stops being is the _daily landing_.

### Which document is corrected

**`information-architecture.md` is now wrong, and it is the one that changes.**
§2's tree predates #164 and puts Orders inside Sell [Commerce] with Products as
its sibling.

- **§2.1**, the rule "Commerce's daily work is top-level — _Orders is the job;
  it should not be behind a store picker_". The reasoning survives intact; its
  conclusion does not. Orders leaves Sell and becomes **Sales** at top level,
  because a merchant who only takes bookings must not have to enable a shop to
  see what they have sold.
- **§2.2**, the mapping row `Commerce → Sell → Orders (default) + siblings`,
  which encodes the same superseded structure.
- Both get a note naming #164 as what moved, per §31: no two documents
  describing conflicting current states.

### What a single-capability merchant sees

Appointments-only: Sales, with booking vocabulary only, and no Products. Neither
meets the other's words — see §4 state 3, which is where that rule is enforced.

### The constraint on shipping any of it

`nav-items.tsx:23` states only routes that exist may be listed, and
`scripts/check-app-routes.mjs` **fails the build** over a nav entry that 404s.
The nav change lands in the same commit as the route, never ahead of it.

---

## 6. What this spec does not decide

- **The prototype (#172)** — the row across four scenes. Open.
- **Sorting.** A booking's meaningful date is in the future and an order's is in
  the past; a single list sorted by date has to say which date it means. Raised
  by #172 item 2 and settled with the prototype, not before it.
- **Collapsing `Contact` and `Customer`** (ARCH-002) and **RLS** (SEC-004) stay
  out, per #163 Decision 2.
- **Saved views.** `SavedView.resource` already takes `"orders"`; whether Sales
  gets its own resource key is an implementation-plan question.
- **Anything model-backed** (DEC-015).
