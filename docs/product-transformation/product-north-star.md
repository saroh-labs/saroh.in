# Product north star

> Audit-only cycle. **Proposal requiring product-owner approval.**
> Grounded in what the repository actually supports — see
> [`current-state-audit.md`](./current-state-audit.md).

---

## 1. A caveat the brief should hear first

The brief instructs: _"The primary commercial direction must now become
e-commerce."_

**The repository does not currently favour commerce.** Appointments, CRM,
Website and Communications are as built as Commerce — same registry, same
readiness system, same depth of schema. Commerce has no privileged position in
the data model, the API or the navigation.

So commerce-first is a **positioning and defaults decision**, not a description
of the code. It is entirely achievable, and this document assumes it — but it
should be made knowingly, because it has costs:

- The onboarding language that already tests well (_"Take appointments"_,
  _"Show up online"_) is deliberately business-model neutral.
- Roughly half the built surface area serves non-commerce businesses.
- A studio or clinic arriving at a commerce-first marketing site may not
  recognise that the product fits them.

**Recommendation:** commerce-**led**, not commerce-only. Lead with commerce in
marketing, defaults and the first-run path; keep the product honest about
serving service and hybrid businesses. That matches both the brief's intent and
what is built.

---

## 2. Positioning

> **Saroh is a modular commerce operating system that helps growing businesses
> sell, manage customers, automate operations and build their online presence
> from one workspace.**

Refinement the evidence supports:

> **Run your whole business from one place — switch on only what you need.**
> Sell products, take bookings, keep every customer in one record, and publish
> the site that fronts it. Add capabilities as the business grows; turn them off
> without losing the data.

The second version is already live on `saroh.in` (commit `c3f8d43`) and is
grounded in the module registry rather than aspiration.

### What Saroh is not

- Not a website builder with a shop bolted on.
- Not a CRM with invoicing.
- Not a suite of separate tools sharing a login.

The claim that distinguishes it: **one customer record behind an order and a
booking.** See §6 — that claim is not yet true.

---

## 3. Product principle

> **Modular for the architecture; outcome-driven for the user.**

The architecture stays modular — 8 capabilities, typed dependencies, independent
enable/disable. The _interface_ never asks a merchant to assemble modules.

**The good news:** the product already speaks this language at
`/onboarding/modules` — _"What does your business need to do?"_ with cards like
_Sell products_, _Take appointments_, _Show up online_.

**The gap:** that vocabulary is discarded the moment onboarding ends. The
merchant is handed a sidebar of module names. Carrying the onboarding language
into the shell is the single highest-leverage UX change available.

---

## 4. First launch persona

**Recommended: the small D2C brand already selling on Instagram/WhatsApp,
moving to its own storefront.**

| Attribute | Value                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| Size      | 1–5 people; owner is the operator                                                 |
| Currently | Instagram/WhatsApp DMs, manual payment links, orders in a notebook or spreadsheet |
| Catalogue | 10–200 SKUs                                                                       |
| Wants     | A real storefront, orders that do not get lost, repeat customers they can message |
| Pain      | Order chaos, no customer memory, no payment reconciliation                        |

### Why this persona

1. **It exercises the most-built path** — Commerce + Website + Payments + a
   customer record, all of which exist.
2. **It has an acute, nameable pain** — "orders get lost in DMs" is easier to
   sell against than "unify your operations".
3. **It needs modularity immediately** — they start with products and a site,
   then add Communications, then Automations. That is the product's story
   demonstrated rather than asserted.
4. **The empty-state problem is smallest** — they arrive with a catalogue to
   import, so a populated workspace is one import away.

### Deliberately not first

- **Appointment-only businesses** (salons, clinics) — well served, but a
  crowded, feature-mature category to win from.
- **Multi-location retail** — needs the `Project`/`Store` question resolved
  (see [`domain-boundaries.md`](./domain-boundaries.md) §4).
- **Large catalogues (10k+ SKUs)** — no performance work has been done; there is
  no evidence the platform is ready.

### Second persona

**The hybrid seller** — sells products _and_ takes bookings. Rare in competing
tools, well supported here, and the sharpest proof of the modular claim. Blocked
on the unified customer record (§6).

---

## 5. What "good" looks like

A merchant should be able to:

1. Answer what their business does — not choose modules.
2. Import a catalogue or add a first product in one sitting.
3. Connect payments without reading documentation.
4. Publish a branded storefront that looks like _theirs_, not like Saroh.
5. Take a test order end to end.
6. Open the workspace the next morning and see what needs attention.
7. Find one customer and see everything about them — orders, bookings,
   messages — in one place.
8. Add a capability later without re-learning the product.

Items 4 and 7 are **not currently achievable** (§6).

---

## 6. Two claims we must not make yet

These matter because the marketing site now makes one of them.

### 6.1 "One customer record behind an order and a booking" — currently false

`Customer` is store-scoped with a nullable `organizationId`; reconciliation to a
`Contact` is manual (`CustomerIdentityLink.linkedByUserId`). Someone has to
press a button. Audit §4.2.

**Either** fix it (SEC-005 → auto-linking) **or** stop claiming it. The first is
better; it is the strongest differentiator the product has.

### 6.2 "Your branded storefront" — partially false

The publication pipeline is real and versioned, and the `--site-*` token layer
exists. But the publication snapshot carries **no brand fields**, so every
merchant's site renders in identical greys. Audit §7.

---

## 7. Success measures

Instrument before optimising. None of these are measurable today — there is no
product analytics.

**Activation**

| Milestone     | Definition                                         |
| ------------- | -------------------------------------------------- |
| Configured    | Business questions answered, capabilities selected |
| Catalogued    | ≥1 product created or imported                     |
| Payable       | Payment provider connected and healthy             |
| Published     | Site live on a domain                              |
| Proven        | Test order completed end to end                    |
| **Activated** | **First real order or booking received**           |

**Retention.** Weekly active merchants · orders processed per merchant per week
· capabilities added after week 1 · merchants who turn one off (a churn
predictor).

**Product health.** Time to first product · time to first order · % reaching
Published within 7 days · % who add a second capability within 30 days.

---

## 8. Non-negotiables

1. Turning a capability off never deletes data.
2. Merchant sites never carry Saroh's brand.
3. `api.saroh.in` stays the only database-facing service.
4. Modularity is preserved internally, whatever the interface shows.
5. Marketing claims match what ships (§6).
6. No security defect is papered over with UI work.

---

## 9. Decisions

Recorded 2026-08-02.

| #   | Decision                                           | Outcome                                                                       |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Commerce-**led** or commerce-**only**? (§1)        | **Commerce-led.** §1's recommendation adopted — service/hybrid stay supported |
| 2   | Is the D2C-brand persona right? (§4)               | **Open** — not yet confirmed                                                  |
| 3   | Fix the unified-customer claim, or drop it? (§6.1) | **Open** — see §6.1                                                           |
| 4   | Waitlist or open signup?                           | **Waitlist**, with UX work landing before open signup                         |
| 5   | Pricing shape — base + capabilities + usage?       | **Parked** — no entitlement work this cycle                                   |

### What "commerce-led" changes

Now settled, so it can be acted on:

- The marketing site leads with selling; service and hybrid businesses appear as
  supported, not as the headline.
- Onboarding **defaults** to the sell-products path; other outcomes stay one
  click away and equally functional.
- Navigation puts `Sell` above `Bookings`
  ([`information-architecture.md`](./information-architecture.md) §2).
- Seed data (DATA-001) models a product business first.

**What it does not change.** No capability is downgraded, no schema favours
Commerce, and the module registry stays neutral. This is positioning and
defaults — reversible.

### Consequence of the waitlist decision

LAUNCH-001 shrinks: nothing needs switching to open signup. It reduces to
keeping the marketing site honest — which currently means §6.1, since the site
claims a unified customer record the code does not deliver.
