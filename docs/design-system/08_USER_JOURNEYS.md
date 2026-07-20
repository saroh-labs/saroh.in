# 08 · User Journeys

> **Status:** Target design (docs-only). Grounded in the real `app.saroh.in` App Router routes as of 2026‑07‑20.
> **Anchor:** _Saroh Canvas_ — calm, one product, **one primary action per screen**, progressive disclosure, minimize clicks, empty states teach, success states explain what's next, AI assists inline.
> **Scope:** the eleven core end‑to‑end journeys. Each contrasts the **current** flow (with real file/route citations) against the **ideal** flow, and gives a **click‑count before/after with the WHY**.

## How to read this doc

- **Click** = one discrete user commit action: a nav/link click, a button press, a select-open+choose, or a form submit. Typing into an already-focused field is _not_ counted; focusing a new field via click _is_ counted only where the flow forces it. Counts are for the **happy path, keyboard/mouse desktop**, from the stated entry point to the stated success state.
- **Primary action** = the single most-important thing the screen exists to let the user do. Saroh Canvas mandates exactly one per screen.
- **AI assist** = where the Business‑OS AI should remove typing or decisions, not where it does today (there is **no AI surface in the app today** — no `app/ai`, no assist affordance in any form).

### Current IA vs target IA (the frame for every journey)

|               | Today (real)                                                                                                                                 | Target (goal‑based)                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Primary nav   | Stores · Sites · Contacts · Leads · Pipeline · Services · Bookings · Analytics · Notifications (`components/shared/app-header.tsx`, `NAV[]`) | Home · Website · Customers · Appointments · Commerce · Marketing · Insights · Automation · AI · Settings |
| Nav model     | Flat text links, **object-type** names ("Stores", "Sites")                                                                                   | **Goal-based** groups; user thinks in outcomes, not tables                                               |
| Mobile nav    | **None** — `NAV` is `hidden … lg:flex`, so on phones there is _no_ navigation at all                                                         | Bottom bar / drawer with the 10 goals                                                                    |
| Global search | **None** — `command.tsx` exists in `@saroh/ui` but is unused                                                                                 | ⌘K palette over every entity + action                                                                    |
| Home          | "Your stores" list (`app/page.tsx`)                                                                                                          | Activity + next-best-actions Home                                                                        |
| AI            | absent                                                                                                                                       | `app/ai` conversational surface, plus inline assist in every create form                                 |

**WHY this matters for every journey below:** today the app is organized around _database tables the engineer built_ (Stores, Sites, Leads) rather than _jobs the owner is trying to do_ (get a website live, get a customer booked). Re-labeling to goals and adding search/mobile nav is the multiplier that shortens every single journey.

---

## Journey 1 — Create workspace / organization

**Entry:** first sign-in. `app/page.tsx` calls `listOrganizations()`; if zero it `redirect("/onboarding")`.

### Current

| #   | Screen / route                            | Action                         | Notes                                                                               |
| --- | ----------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| 1   | `/onboarding` (`app/onboarding/page.tsx`) | Focus "Organization name"      | `CreateOrganizationForm`: name required, ~6 optional profile fields in a `fieldset` |
| 2   | same                                      | Submit "Create organization"   | server action sets org active, `router.push("/")`                                   |
| 3   | `/` dashboard                             | Read "Your stores" empty state | Lands on an _empty_ screen with a second setup task                                 |

**Current clicks to a usable workspace: 2** (name + submit) — but the user lands on **another empty state** ("Your stores" + "Create a store"), so the _felt_ journey is "I set up an org and still have nothing."

### Ideal

| #   | Screen                                                                                                                         | ONE primary action                | AI assist                                                                | Empty/success                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | `/onboarding` — "What's your business called?"                                                                                 | Type business name → **Continue** | AI infers business _type_ + suggests a starter goal from the name/domain | Single field, no optional fieldset visible (progressive disclosure)                                                   |
| 2   | `/onboarding` — "What do you want to do first?" (goal cards: _Launch a website · Take bookings · Sell products · Track leads_) | Click one goal                    | AI pre-selects the most likely goal                                      | —                                                                                                                     |
| 3   | `/` Home                                                                                                                       | —                                 | —                                                                        | **Success state**: "Workspace ready. Here's your first step: [chosen goal]" with a live checklist, not an empty table |

**Ideal clicks: 2** (name+continue counts 1, goal 1) to a workspace **that already knows what the user wants next**.

**WHY:** click-count is already low (2); the win is _outcome_, not clicks. Today onboarding ends on an empty "Your stores" screen — a dead end that violates "success states explain what's next." The org profile fieldset (address/phone/etc.) is asked _before the user has any reason to care_; defer it to Settings (progressive disclosure). Replacing "Create a store" with a **goal picker** turns setup into momentum.

---

## Journey 2 — Create a website

**Entry:** primary nav "Sites" → `/sites`.

### Current

| #   | Route                                   | Action                                          |
| --- | --------------------------------------- | ----------------------------------------------- |
| 1   | `/sites` (`app/sites/page.tsx`)         | Click "Create a site" / "New site"              |
| 2   | `/sites/new` (`app/sites/new/page.tsx`) | Focus name field in `CreateSiteForm`            |
| 3   | `/sites/new`                            | Pick a template (fetched via `listTemplates()`) |
| 4   | `/sites/new`                            | Submit                                          |
| 5   | `/sites/[siteId]`                       | Land in editor                                  |

**Current clicks: ~4** (New site → name → template → submit). The word **"Site"** is object-language; a non-technical owner looking to "make a website" may not map "Sites" to that job (IA gap — nav says "Sites").

### Ideal

| #   | Screen                          | ONE primary action                                  | AI assist                                                                                            | Empty/success                                                                                        |
| --- | ------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Home or `/website`              | Click "Build my website"                            | —                                                                                                    | Empty state on `/website` _teaches_: "A website is your storefront. Pick a look, we'll fill it in."  |
| 2   | `/website/new` template gallery | Click a template (large visual cards, live preview) | AI **pre-fills** copy, sections, and images from the org name + business type captured at onboarding | Name is auto-derived (org name); no separate name step                                               |
| 3   | `/website/[id]` editor          | —                                                   | AI "Draft my homepage" button seeds all sections                                                     | **Success:** "Your website is drafted. Edit any section, then Publish." + one primary Publish button |

**Ideal clicks: 2** (build → pick template). Naming and section-seeding are removed by AI + defaults.

**WHY:** cutting 4→2 clicks matters, but the real value is the **AI-drafted first site**: the current `CreateSiteForm` hands the user an empty editor (blank-canvas paralysis). Progressive disclosure means "name your site" should never be its own decision — inherit the org name. Rename nav **Sites → Website** so the job is findable.

---

## Journey 3 — Publish a website

**Entry:** inside the site editor `/sites/[siteId]`.

### Current

- Publishing exists at the model level (roadmap Stage 2: `Publication`/`PageVersion`), and `app/sites/[siteId]/page.tsx` is the editor. There is **no distinct, obvious "Publish" primary action documented in the shell**; publish is buried among section-editing controls, and there is **no success confirmation route** (e.g. "your site is live at `subdomain.saroh.in`"). `app/sites/page.tsx` already _shows_ the subdomain, proving the live URL exists but is never celebrated.

**Current clicks (est.): 2–3** to publish, but **no clear "you are live + here's the link + share it" moment.**

### Ideal

| #   | Screen                     | ONE primary action                                                            | AI assist                                                         | Success                                                                                                                    |
| --- | -------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/website/[id]` editor     | Click **Publish** (always-visible top-right, the screen's one primary action) | AI pre-publish check: "3 sections still say _Lorem ipsum_ — fix?" | —                                                                                                                          |
| 2   | Publish confirmation sheet | Confirm subdomain / connect domain                                            | AI suggests SEO title + meta from content                         | **Success screen:** "You're live 🎉 `acme.saroh.in`" → Copy link · View site · Share, plus "Next: connect your own domain" |

**Ideal clicks: 2** (Publish → Confirm).

**WHY:** the model already computes the live URL (`site.subdomain` in `app/sites/page.tsx`) but the UI never gives the owner the payoff of _seeing their site go live_. A calm, explicit success state ("explain what's next") is the emotional peak of the whole website journey — currently missing. AI's pre-publish lint prevents the #1 embarrassment (publishing placeholder text).

---

## Journey 4 — Capture the first lead

**Entry:** primary nav "Leads" → `/leads`.

### Current — **broken primary action**

| #   | Route                           | Observation                                                                                                                            |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/leads` (`app/leads/page.tsx`) | Header buttons are **"Pipeline board"** only. There is **no "New lead" button on the leads index.**                                    |
| —   | empty state                     | Copy literally says _"You can also create one by hand from a contact"_ — i.e. the primary create path is a detour through `/contacts`. |
| 2   | `/contacts` → `/contacts/[id]`  | Create contact, then create lead from there                                                                                            |

**Current clicks to capture a lead by hand: ~5+** (Contacts → New contact → save → open contact → create lead) — because the leads screen has **no create affordance at all.** This is the single worst primary-action gap in the app.

### Ideal

| #   | Screen                                 | ONE primary action                        | AI assist                                                                                | Empty/success                                                                                                      |
| --- | -------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | `/customers` → Leads tab (or `/leads`) | Click **"Add lead"** (top-right, primary) | —                                                                                        | Empty state teaches _and_ shows the auto-capture promise: "Leads from your website forms land here automatically." |
| 2   | Add-lead sheet                         | Type name/enquiry → **Save**              | AI parses a pasted email/WhatsApp message into name + contact + value; AI suggests stage | **Success:** "Lead added to _New_. Next: reply or move to _Qualified_."                                            |

**Ideal clicks: 2** (Add lead → Save). Website-form leads = **0 clicks** (auto-created).

**WHY:** 5→2 is a 60% reduction on the CRM's core loop, and the empty state finally _sells the auto-capture value_ instead of pointing users to a workaround. Add a `/leads/new` route + an "Add lead" button on `app/leads/page.tsx` — the highest-ROI single fix in this doc.

---

## Journey 5 — Create a customer

**Entry:** commerce → store customers.

### Current

| #   | Route                             | Action                             |
| --- | --------------------------------- | ---------------------------------- |
| 1   | `/` dashboard                     | Click a store card                 |
| 2   | `/stores/[storeId]`               | Click "Customers" tab (`StoreNav`) |
| 3   | `/stores/[storeId]/customers`     | Click "New customer"               |
| 4   | `/stores/[storeId]/customers/new` | Fill + submit                      |

**Current clicks: ~4**, and note **"Customers" only exists _inside a store_** (`app/stores/[storeId]/customers`). There is **no org-level customer list** — yet Leads/Contacts _are_ org-level. So "who are my customers?" is fragmented across `/contacts` (CRM) and per-store customers (commerce). Two customer concepts, two homes.

### Ideal

| #   | Screen                                                       | ONE primary action       | AI assist                                               | Success                                                                             |
| --- | ------------------------------------------------------------ | ------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `/customers` (org-level, unifies Contacts + store customers) | Click **"Add customer"** | AI de-dupes against existing contacts/leads as you type | —                                                                                   |
| 2   | Add-customer sheet                                           | Type name/email → Save   | AI enriches (company, timezone) from email domain       | **Success:** "Customer added. Create a booking or order for them?" (next-step CTAs) |

**Ideal clicks: 2** (from a unified `/customers`).

**WHY:** merging Contacts + per-store Customers under one **Customers** goal (per target IA) removes the "which customer list?" confusion and cuts 4→2. The next-step CTAs turn a bare record into the start of a booking/order — "success states explain what's next."

---

## Journey 6 — Book an appointment

**Entry:** nav "Bookings" / "Services".

### Current

- `app/services/page.tsx`, `app/services/new/page.tsx`, `app/bookings/page.tsx` exist. To take a booking an owner must first **create a Service** (`/services/new`), then a booking references it. There is no evidence of a single "Book now" primary action that spans service+customer+time; the concepts are split across `/services` and `/bookings` and are **object-language** ("Services", "Bookings") rather than the goal **"Appointments."**

**Current clicks (est.): 6+** first-time (create service → save → go to bookings → new booking → pick service → pick customer → pick time → save).

### Ideal

| #   | Screen                | ONE primary action                        | AI assist                                                               | Empty/success                                                                                            |
| --- | --------------------- | ----------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | `/appointments`       | Click **"New appointment"**               | —                                                                       | Empty state teaches: "Set your services & hours once; then share a booking link so customers self-book." |
| 2   | New-appointment sheet | Pick service → customer → slot → **Book** | AI suggests the next open slot; AI matches a returning customer by name | **Success:** "Booked for Tue 3pm. Confirmation sent. Add to your calendar?"                              |
| —   | Self-serve link       | _customer_ books → **0 owner clicks**     | AI answers customer questions on the booking page                       | Owner just sees it appear                                                                                |

**Ideal clicks: 2** owner-side for a manual booking; **0** for a customer self-booking.

**WHY:** collapse Services + Bookings into one **Appointments** goal with service/hours as _setup you do once_ (progressive disclosure), so the recurring act of booking is 2 clicks not 6. The self-serve booking link is the point of the feature — surface it as the empty state's promise.

---

## Journey 7 — Create a product

**Entry:** commerce → store products.

### Current

| #   | Route                            | Action                                                                                                                                  |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/`                              | Click store card                                                                                                                        |
| 2   | `/stores/[storeId]`              | Click "Products" tab                                                                                                                    |
| 3   | `/stores/[storeId]/products`     | Click "New product"                                                                                                                     |
| 4   | `/stores/[storeId]/products/new` | `ProductForm` (`components/stores/product-form.tsx`) + variants (`product-variants.tsx`): name, price, description, inventory, variants |
| 5   | submit                           |                                                                                                                                         |

**Current clicks: ~4** to reach the form; the form itself is dense (variants + inventory shown upfront).

### Ideal

| #   | Screen               | ONE primary action                                                               | AI assist                                                                                        | Success                                                                                           |
| --- | -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 1   | `/commerce/products` | Click **"Add product"**                                                          | —                                                                                                | Empty state teaches: "Add a product, then share your store link — or let AI import your catalog." |
| 2   | Add-product sheet    | Type name + price → **Save** (variants/inventory collapsed behind "Add options") | AI writes the description + suggests price from name; AI extracts product from an uploaded photo | **Success:** "Product live. Add another, or share your store?"                                    |

**Ideal clicks: 2** (Add product → Save) with variants/inventory **progressively disclosed**.

**WHY:** the current `ProductForm` shows variants + inventory to everyone, but most first products have neither — that's decision fatigue on step one. Collapse advanced fields; let AI draft copy so the owner types _name + price_ and ships. 4→2 clicks, and a far calmer first form.

---

## Journey 8 — Receive an order

**Entry:** a customer buys (or owner records a manual order at `/stores/[storeId]/orders/new`).

### Current

- `app/stores/[storeId]/orders/page.tsx` lists orders; `orders/new` builds one manually (`listCustomers()` + products, reserve/commit/release inventory per memory). Incoming orders surface via **Notifications** (`unreadNotificationCount()` in AppHeader) as a **number badge only** — no rich "new order" moment, no order-status timeline highlighted in the shell. Orders live **inside a single store**, so a multi-store owner has no consolidated "what sold today" view.

**Current owner clicks to process an incoming order: ~4** (open store → Orders tab → open order → mark fulfilled).

### Ideal

| #   | Screen                    | ONE primary action                                                    | AI assist                                   | Success                                                                         |
| --- | ------------------------- | --------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Home / `/commerce/orders` | Click the **new-order** card (surfaced on Home as a next-best-action) | AI flags fraud/stock risk                   | —                                                                               |
| 2   | `/commerce/orders/[id]`   | Click **"Fulfil"** (the one primary action)                           | AI drafts the shipping/confirmation message | **Success:** "Order fulfilled. Customer notified. 2 more awaiting fulfilment →" |

**Ideal clicks: 2** (open order → Fulfil), reachable from Home not buried in a store.

**WHY:** an order is money arriving — it deserves a **first-class moment on Home**, not a bare notification integer. Consolidating orders at the org level (Commerce goal) lets a multi-store owner act on "3 orders to fulfil" without diving store-by-store. The success state chains to the _next_ order, keeping the fulfilment flow moving.

---

## Journey 9 — Create a campaign (Marketing)

**Entry:** target nav "Marketing".

### Current — **feature absent**

- There is **no marketing surface at all**: no `app/marketing`, no campaigns route, nothing in `NAV[]`. Roadmap lists marketing as later-stage. So today the journey is **impossible in-product** (owners would use an external tool).

**Current clicks: N/A (0 possible — no entry point).**

### Ideal

| #   | Screen           | ONE primary action                                         | AI assist                                                                                           | Empty/success                                                                                                    |
| --- | ---------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | `/marketing`     | Click **"New campaign"**                                   | —                                                                                                   | Empty state teaches: "Turn customers & leads into repeat business. Start with a welcome email." + template cards |
| 2   | `/marketing/new` | Pick audience (from Customers/Leads) + channel → **Draft** | AI writes subject + body from the goal ("win back lapsed customers"); AI picks the audience segment | —                                                                                                                |
| 3   | Review           | Click **Send / Schedule**                                  | AI predicts best send time                                                                          | **Success:** "Campaign scheduled for 340 customers. Track opens in Insights."                                    |

**Ideal clicks: 3** (New → draft → send) for something currently uncreatable.

**WHY:** marketing closes the Business‑OS loop (you captured leads and customers in Journeys 4–5 — now re-engage them). AI-drafted copy + auto-segmentation is what makes a solo owner able to run marketing at all. Even before the backend ships, the empty state should _exist_ to teach the promise (progressive disclosure of a coming capability, clearly labeled).

---

## Journey 10 — Invite a team member

**Entry:** per-store Members.

### Current

| #   | Route                                                                 | Action                                                                      |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | `/`                                                                   | Click store card                                                            |
| 2   | `/stores/[storeId]`                                                   | Click "Members" tab                                                         |
| 3   | `/stores/[storeId]/members` (`app/stores/[storeId]/members/page.tsx`) | `MembersManager` → enter email, pick role, send invite                      |
| 4   | submit invite                                                         |                                                                             |
| —   | invitee                                                               | opens `/invitations/[token]` (`app/invitations/[token]/page.tsx`) to accept |

**Current clicks: ~4**, and invites are **scoped to one store only** — there is **no org-level team**. `canManage` is owner-only. To staff three stores you invite the same person three times.

### Ideal

| #   | Screen                       | ONE primary action                                                         | AI assist                                                   | Success                                                                                        |
| --- | ---------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | `/settings/team` (org-level) | Click **"Invite teammate"**                                                | —                                                           | Empty state: "Add teammates and choose what they can access."                                  |
| 2   | Invite sheet                 | Type email(s), pick role + scope (whole org or specific stores) → **Send** | AI suggests role from job title; bulk-paste multiple emails | **Success:** "Invite sent to alex@… They'll appear here once they accept." + pending-state row |

**Ideal clicks: 2** (Invite → Send), from a **single org-level Team screen** in Settings.

**WHY:** moving Members from per-store to **Settings → Team** (target IA) means one invite grants scoped access across stores, killing the "invite them N times" tax. The pending-invite row makes the async accept flow legible ("explain what's next").

---

## Journey 11 — Ask AI

**Entry:** target nav "AI" / global assist.

### Current — **feature absent**

- **No AI anywhere in the app.** No `app/ai`, no assist button in any form, no ⌘K. The product is positioned as "AI-powered Business OS" but the app ships zero AI touchpoints today. Biggest brand-vs-reality gap.

**Current clicks: N/A.**

### Ideal

| #   | Screen     | ONE primary action                                                                 | Behavior                                                                            | Success                                                                         |
| --- | ---------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Any screen | Press **⌘K** or click the persistent AI button                                     | Opens the assistant with **context of the current screen** (this store, this lead)  | —                                                                               |
| 2   | AI panel   | Type a goal in plain language: _"Email everyone who bought last month a 10% code"_ | AI proposes the concrete actions (draft campaign, segment, discount) with a preview | —                                                                               |
| 3   | Preview    | Click **"Do it"**                                                                  | AI executes across Customers + Marketing + Commerce                                 | **Success:** "Done — campaign scheduled, code created. Review before it sends?" |

**Ideal clicks: 2–3** to turn a sentence into cross-module actions.

**WHY:** the AI is the _reason to choose Saroh over ten separate tools_ — it should be one keystroke from anywhere and act **across modules** (the thing point-tools can't do). Context-awareness (knowing which lead/store you're on) is what makes it feel like an OS, not a chatbot. It also becomes the universal fallback for every journey above: any task that's >2 clicks by hand should be doable by asking.

---

## Cross-journey scorecard

| Journey            | Current clicks  | Ideal clicks     | Δ             | Biggest win                                  |
| ------------------ | --------------- | ---------------- | ------------- | -------------------------------------------- |
| 1 Create workspace | 2 (→ dead-end)  | 2                | outcome       | goal picker replaces empty "Your stores"     |
| 2 Create website   | ~4              | 2                | −50%          | AI-drafted first site; rename Sites→Website  |
| 3 Publish website  | 2–3 (no payoff) | 2                | success state | "You're live" moment + share                 |
| 4 Capture lead     | **~5+**         | 2                | **−60%**      | add missing "Add lead" primary action        |
| 5 Create customer  | ~4              | 2                | −50%          | unify Contacts + Customers                   |
| 6 Book appointment | 6+              | 2 (0 self-serve) | −67%          | Appointments goal + self-book link           |
| 7 Create product   | ~4              | 2                | −50%          | progressive disclosure of variants + AI copy |
| 8 Receive order    | ~4              | 2                | −50%          | order as a Home moment, org-level            |
| 9 Create campaign  | ∞ (absent)      | 3                | new           | marketing exists at all                      |
| 10 Invite teammate | ~4 (per store)  | 2                | −50%          | org-level team, scoped access                |
| 11 Ask AI          | ∞ (absent)      | 2–3              | new           | the whole point of the product               |

**Three structural moves unlock most of the above:** (1) **goal-based IA** so jobs are findable; (2) **an "Add X" primary action + `X/new` route on every index** (Leads is the glaring miss); (3) **AI drafting + smart defaults + progressive disclosure** so every create form is _name-a-thing → Save_.
