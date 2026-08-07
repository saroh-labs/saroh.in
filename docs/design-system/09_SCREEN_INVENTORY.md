# 09 · Screen Inventory

> A grounded, per-route inventory of every screen in the Saroh product surface.
> Companion docs: [01 Product Design Philosophy](./01_PRODUCT_DESIGN_PHILOSOPHY.md) · [10 UX Audit](./10_UX_AUDIT.md)
>
> **Method & provenance.** Every row below was written from the actual `page.tsx`
> (and, where relevant, `layout.tsx` / shared component) source, not from
> assumption. Screens marked **[read]** were read in full during this audit;
> screens marked **[read via extraction]** were read in full by a sub-agent and
> reported back verbatim; a handful of leaf behaviours that live inside client
> components (e.g. the field list inside `ProductForm`) are marked \*\*[inferred
>
> > from component surface]\*\* because the `page.tsx` only mounts the component —
> > those are called out honestly rather than invented. Container widths, heading
> > tags, and component imports are quoted exactly from source.
>
> **2026-08-08:** the live-site address quoted below as `{subdomain}.saroh.in` is now
> `{subdomain}.saroh.app` — merchant sites moved off `saroh.in`.

---

## 0. The shell every app.saroh.in screen inherits

Before the per-screen table: three things wrap **every** authenticated
`app.saroh.in` route and shape all findings below.

| Element               | File                                                        | What it does                                                                                                                                                                                                                              | Baseline issues                                                                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RootLayout`          | `apps/app.saroh.in/app/layout.tsx`                          | Mounts `<AppHeader/>` once above `{children}`; sets `defaultTheme="light"` + `enableSystem`; loads Inter via `localFont`.                                                                                                                 | `enableSystem` is on but the product ships **no dark styling** in `globals.css` beyond the shadcn `.dark` token block — so a user on OS dark mode gets the dark tokens with light-only page code in places (see accounts `/apps`).                                 |
| `AppHeader`           | `apps/app.saroh.in/components/shared/app-header.tsx`        | Global chrome: `Wordmark`, `OrganizationSwitcher`, flat 8-item nav (`Stores/Sites/Contacts/Leads/Pipeline/Services/Bookings/Analytics`) + `Notifications` (with unread badge) + `SignOutButton`. Container `mx-auto max-w-6xl px-6 py-3`. | Nav is `hidden … lg:flex` — **on tablet/mobile there is no navigation at all** and no hamburger/menu fallback; the org switcher + sign-out remain but you cannot reach any section. 9 flat destinations violates the "one-product, progressive-disclosure" anchor. |
| App-root system pages | `loading.tsx`, `error.tsx`, `not-found.tsx`                 | Skeleton (`max-w-4xl p-8`, 4 pulse rows), fail-loud error boundary with "Try again", styled 404.                                                                                                                                          | Solid baseline. But these are the **only** loading/error surfaces in the app — no route segment defines its own `loading.tsx`/`error.tsx`, so every navigation shares one generic skeleton regardless of the destination's real layout.                            |
| `MaxWidthWrapper`     | `apps/app.saroh.in/components/shared/max-width-wrapper.tsx` | `mx-auto w-full max-w-screen-xl px-2.5 lg:px-20`.                                                                                                                                                                                         | **Defined but effectively unused** by the page files audited — pages hand-roll their own `mx-auto max-w-Nxl p-8` instead, which is the root cause of the width inconsistency documented throughout.                                                                |

**Container-width census (the single biggest visual-consistency defect).** Across
sibling top-level pages the main column width is set eight different ways:

| Width token       | Screens using it                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `max-w-md`        | invitations/[token]                                                                                               |
| `max-w-lg`        | onboarding                                                                                                        |
| `max-w-3xl`       | lead detail, notifications, bookings                                                                              |
| `max-w-4xl`       | dashboard, contacts (+detail), leads, services (+detail/new), sites (+new), stores/new, loading, error, not-found |
| `max-w-5xl`       | analytics, store shell layout                                                                                     |
| `max-w-6xl`       | AppHeader, site editor, pipeline (empty state)                                                                    |
| `max-w-full`      | pipeline (board)                                                                                                  |
| `max-w-screen-xl` | MaxWidthWrapper (unused)                                                                                          |

The header sits at `max-w-6xl` while most content sits at `max-w-4xl`, so the
**brand/nav and the content it frames are not left-aligned to the same edge** on
wide screens. This is cited per-screen below and scored in [10 UX Audit](./10_UX_AUDIT.md).

**Cross-cutting patterns** (true for nearly every content screen, stated once here
and referenced by exception below):

- Server components gated by `requireSession()`; org scope carried by `x-organization-id` (`lib/api/http.ts`).
- Read services **fail loud**: a non-404 5xx throws → app-root `error.tsx`; a 404 → `null`/`notFound()`. Good.
- List empty-states are dashed-border cards with a heading + one line of copy.
- **All create/edit forms are hand-rolled** client components using `useState` + a server action + `toast` (sonner). Only `packages/ui/.../form.tsx` uses `react-hook-form`; **no product form uses `react-hook-form`/`zod`-resolver, `aria-invalid`, or `role="alert"`** (verified by grep). Validation surfaces as a toast, not inline field errors.
- Detail/create pages navigate back via a **plain `←` glyph text link**, not a Button or breadcrumb. No breadcrumb component exists anywhere.
- 10 form components render **native `<select>`** (unstyled) rather than the shadcn `Select`, so control styling is inconsistent within the same form.

---

## A. Entry, identity & marketing (non-app)

### saroh.in — Marketing home `[read via extraction]`

- **Route / file:** `/` · `apps/saroh.in/app/page.tsx`
- **Purpose:** Pre-launch waitlist / brand landing. **Primary user:** prospect. **Main action:** join waitlist. **Secondary:** none in-page.
- **Layout:** `<main class="flex min-h-screen flex-col items-center justify-between bg-neutral-950">` — **dark theme**, deliberately unlike the app. Sections: `SpotlightPreview`, `BentoGridThirdDemo`, `SparklesPreview`, `JoinWaitlist` (Aceternity-style effect components in `@/components/home/*`).
- **Components:** bespoke marketing components; not `@saroh/ui`.
- **UX problems:** No in-file `h1`, nav, footer, or pricing — it is a single scrolling effects reel ending in a waitlist. Four commented-out hero experiments (`NewHero`, `Hero`, `GoogleGeminiEffectDemo`, `CardHoverEffectDemo`) remain as dead code. **Why it matters:** the marketing surface sets the first impression and currently answers "what is this product?" only through visual effect, not copy a prospect can scan or a search engine can index.
- **A11y:** heading structure lives inside effect components (unverified here); heavy animation with no visible reduced-motion guard. **Mobile:** effect-heavy pages are the most fragile on low-end mobile. **Consistency:** intentionally divergent from the app (acceptable for marketing, but the two worlds share no visual DNA).
- **Opportunity:** add a real copy-driven hero + value props so the page answers _what / for whom / why_ without motion.

### accounts.saroh.in — Login `[read via extraction]`

- **Route / file:** `/login` · `apps/accounts.saroh.in/app/(auth)/login/page.tsx`
- **Purpose:** authenticate. **Primary user:** returning user. **Main action:** sign in. **Secondary:** forgot password, go to signup (inside `LoginForm`).
- **Layout:** `"use client"`, body is literally `return <LoginForm/>`. Shared `(auth)/layout.tsx` centers a `Wordmark` (links to saroh.in) over `min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8`. Form self-sizes (no page max-width).
- **UX problems:** the file carries a **large block of commented-out dead code** (old stone-themed card, GitHub OAuth button, marketing copy) and a stray `// const {}=` line. **It is the only auth page missing a `metadata` export** — the shared layout's `metadata` says "Login | Saroh" for all four auth routes, so signup/forgot/reset get a mislabeled fallback title.
- **A11y/forms:** field labels, autocomplete, and error display live in `LoginForm` **[inferred from component surface]**. **Consistency:** login vs the other three auth pages diverge (dead code, missing metadata).
- **Opportunity:** delete dead code; add per-page metadata; confirm labels/autocomplete in `LoginForm`.

### accounts.saroh.in — Signup / Forgot / Reset `[read via extraction]`

- **Routes / files:** `/signup`, `/forgot-password`, `/reset-password` · same `(auth)` group.
- **Purpose:** create account / recover access. Each `page.tsx` is a thin server wrapper (`metadata` + `return <XForm/>`). Shared centered `Wordmark` layout.
- **UX problems:** thin and consistent (good), but every field/validation/OAuth/error behaviour is delegated to `SignupForm`/`ForgotPasswordForm`/`ResetPasswordForm` **[inferred from component surface]** — not auditable from the route. The shared layout's single `metadata` title ("Login | Saroh") mislabels these tabs.
- **Opportunity:** per-page titles; audit the three form components for label/autocomplete/inline-error parity.

### accounts.saroh.in — App launcher `[read via extraction]`

- **Route / file:** `/apps` · `apps/accounts.saroh.in/app/apps/page.tsx`
- **Purpose:** post-login hub to pick which Saroh app to open. **Primary user:** signed-in user. **Main action:** open an app. **Secondary:** sign out.
- **Layout:** `"use client"`, `flex flex-col items-center justify-center gap-2 p-8` → inner card `border border-gray-200 bg-white p-8 rounded-md`. **Hardcoded light colors with no `dark:` variants**, mounted inside the accounts root layout's **dark** `bg-neutral-950` radial background — a white card floating on near-black.
- **Components:** `Button`, `Wordmark`, `authClient.useSession()`. Hardcoded `apps[]` array (Admin/Application/Docs/Sites/Templates/UI/Website) with dev↔prod URL switching.
- **UX problems:** the title "Select the app to open" is a `<div class="text-2xl font-bold">`, **not an `<h1>`**. `console.log(session)` left in. Loading = bare `<div>Loading...</div>`; error = raw `Error: {message}`. App links are plain `<Link>` (no `rel`, no new-tab). **Why it matters:** this is the identity provider's front door for every product; the light-card-on-dark mismatch and unstyled loading/error read as unfinished at the exact moment a new user forms trust.
- **Opportunity:** dark-aware card, semantic heading, remove console.log, styled loading/error, keyboard focus states.

### admin.saroh.in — Admin stub `[read via extraction]`

- **Route / file:** `/` · `apps/admin.saroh.in/app/page.tsx`
- **Purpose:** admin console (not built). **Primary user:** platform admin. **Main action:** none yet.
- **Layout:** `getServerSession` → redirect to accounts login if unauthenticated; `isAdmin` gate → "Not authorized" `<h1>` + email + sign-out. Authorized branch is a **literal placeholder**: `<main class="p-8">`, "Signed in as {email}" + `SignOutButton`, then the text "Admin App We will add the admin page components here Features like:" and a `<ul class="list-disc">` of intended features.
- **UX problems:** the authorized view has **no heading** and the `<ul class="list-disc">` lacks `pl-*`/`list-inside`, so bullets likely clip. Placeholder sentence runs into the list with no `<p>` wrapper. **Why it matters:** any admin who reaches this sees raw developer scaffolding.
- **Opportunity:** either a proper "coming soon" state or gate the route until real content exists.

---

## B. App onboarding & system entry (app.saroh.in)

### Onboarding — create organization `[read via extraction]`

- **Route / file:** `/onboarding` · `apps/app.saroh.in/app/onboarding/page.tsx`
- **Purpose:** the zero-org funnel target (`/` redirects here when `organizations.length === 0`). **Primary user:** brand-new signed-in user. **Main action:** create an organization. **Secondary:** "← Back to dashboard" (only when the user already has orgs).
- **Layout:** `<main class="mx-auto max-w-lg p-8">`; conditional `<h1 class="mt-4 text-2xl font-semibold tracking-tight">` — "Welcome — create your organization" (first-timer) vs "Create an organization"; muted subtitle. Delegates to `CreateOrganizationForm`.
- **UX problems:** single narrow column, no illustration or "what is an organization / why do I need one" explainer beyond the subtitle. When the header renders in the zero-org state it shows **only Wordmark + Sign out** (no nav/switcher), so the user's sole path forward is this form — good focus, but there is no progress indication or sense of "step 1 of N".
- **A11y:** one clean `h1`. **Guidance:** thin — a first-run user isn't told what happens after they name the org. **Opportunity:** add a one-line "you can invite teammates and add stores next" to set expectation.

### Invitation accept `[read via extraction]`

- **Route / file:** `/invitations/[token]` · `.../invitations/[token]/page.tsx`
- **Purpose:** accept a store-team invite. **Primary user:** invited teammate. **Main action:** auto-accept then redirect to the store. **Secondary:** "Go to your stores".
- **Layout:** `<main class="mx-auto flex min-h-[60vh] max-w-md items-center p-8">`. On success it `redirect(...)`; only the **error path renders** — a `Card` titled "Invitation problem" whose description is the **raw `result.error` string**.
- **UX problems:** surfacing an unsanitized error string as primary copy risks leaking internal phrasing; there is no explicit "your invite was accepted" confirmation (a silent redirect). **Why it matters:** invitation accept is a trust-sensitive first touch with a _new_ org — a raw error is a poor welcome. **A11y:** title is a `CardTitle` (heading level unverified — no explicit `h1`).
- **Opportunity:** human-authored error copy per failure class; a brief success interstitial.

---

## C. Home / Stores hub (app.saroh.in)

### Dashboard — Your stores `[read]`

- **Route / file:** `/` · `apps/app.saroh.in/app/page.tsx`
- **Purpose:** list the org's stores; the app's home. **Primary user:** owner. **Main action:** open a store (card) / **New store**. **Secondary:** onboarding redirect when no org.
- **Layout:** `<main class="mx-auto max-w-4xl p-8">`; header row `mb-6 flex items-center justify-between` with `<h1 class="text-2xl font-semibold">Your stores`. List = `grid gap-4 sm:grid-cols-2` of `StoreCard`; empty = `StoresEmptyState` (dashed card, "No stores yet", "Create a store" CTA).
- **Components:** `Button`, `StoreCard`, `StoresEmptyState`.
- **UX problems:** the **"New store" button is hidden whenever the list is non-empty? No — inverse:** it renders only when `stores.length > 0`; when empty, the only create path is the empty-state CTA. That is fine, but the pattern (primary action conditional on list state) recurs app-wide and means the header action **disappears in the empty state** — a user who dismisses the empty card has no persistent "New" affordance. **Why it matters:** the home screen is also the "Stores" nav destination, conflating _product home_ with _one entity list_; per the Saroh anchor the home should answer "where am I / what next", and today it answers only "here are your stores".
- **A11y:** clean `h1`, semantic grid. **Mobile:** `sm:grid-cols-2` is the responsive story; fine. **Consistency:** `max-w-4xl` vs header `max-w-6xl` misaligns brand and content.
- **Opportunity:** persistent primary action; consider a light "at a glance" home rather than a bare store list.

### Store — create `[read via extraction]`

- **Route / file:** `/stores/new` · `.../stores/new/page.tsx`
- **Purpose:** create a store. **Main action:** submit `CreateStoreForm`. **Secondary:** "← Back to stores".
- **Layout:** `max-w-4xl p-8`; `← Back` link then `<h1 class="text-2xl font-semibold">Create a store` (mt-4 mb-6). Form fields/validation **[inferred from component surface: `CreateStoreForm` uses `useState`+action+`Label`]**.
- **UX problems:** no description of what a store is or what happens next; back-link is glyph-only text. **Opportunity:** one-line context + inline validation.

---

## D. CRM — Contacts, Leads, Pipeline (app.saroh.in)

### Contacts — list `[read via extraction]`

- **Route / file:** `/contacts` · `.../contacts/page.tsx`
- **Purpose:** browse contacts. **Primary user:** owner. **Main action:** open a contact. **Secondary:** none — **there is no "create contact" action anywhere on this screen.**
- **Layout:** `max-w-4xl p-8`; `<h1>Contacts` in a `justify-between` row whose **right side is empty**. List = `grid gap-4 sm:grid-cols-2` of `Card` (name + email/company), each card wrapped in a `Link`. Empty = dashed card "No contacts yet / Contacts appear here as enquiries come in…".
- **Components:** `Card` family, `Link`.
- **UX problems:** the empty `justify-between` header telegraphs a missing action; contacts can only appear via enquiry ingestion or "create a lead by hand", so a user wanting to add a contact directly has **no discoverable path**. **Why it matters:** discoverability — the primary CRM object cannot be created from its own list. **A11y:** whole-card links with concatenated text and no `aria-label`. **Consistency:** card grid here vs `<ul>`-row lists in the store workspace — two different list idioms for the same "list of records" job.

### Contact — detail `[read via extraction]`

- **Route / file:** `/contacts/[contactId]` · `.../contacts/[contactId]/page.tsx`
- **Purpose:** read-only contact profile + their leads. **Main action:** open a lead. **Secondary:** none (file comment: "Read-only view").
- **Layout:** `max-w-4xl p-8`; `← Back to contacts`, `<h1>` name, `<p>` email, semantic `<dl>` (`sm:grid-cols-2`) of Company/Phone/Source, then `<h2>Leads (n)` as a `grid gap-3` of cards. Empty leads = inline `<p>` "No leads for this contact yet." (not a card — inconsistent with list empty-states).
- **UX problems:** entirely read-only — no edit, no "add lead for this contact", no "message" — so the profile is a dead-end. **Why it matters:** a CRM contact you can't act on forces the user back out to accomplish anything. **A11y:** good use of `<dl>`. **Opportunity:** at minimum an edit + "new lead from contact" action.

### Leads — list `[read via extraction]`

- **Route / file:** `/leads` · `.../leads/page.tsx`
- **Purpose:** browse leads. **Main action:** open a lead. **Secondary:** "Pipeline board" (`variant="outline"`). **No "create lead" button.**
- **Layout:** `max-w-4xl p-8`; `<h1>Leads`; list = `grid gap-3` single-column cards (title + contact/value + stage Badge + status Badge). Empty = dashed card.
- **UX problems:** same missing-create pattern as contacts; single-column at all breakpoints wastes width on desktop. Two badges per card with color-coded status. **A11y:** status conveyed by badge color+text (text present — ok). **Consistency:** `grid gap-3` (1 col) vs contacts `sm:grid-cols-2` — sibling CRM lists disagree on columns.

### Lead — detail `[read]`

- **Route / file:** `/leads/[leadId]` · `.../leads/[leadId]/page.tsx`
- **Purpose:** the richest working surface in the app — move stage, set status, add note, schedule follow-up, send message, manage consent, read activity timeline. **Main action:** advance the lead (move stage / status). **Secondary:** the six other controls.
- **Layout:** `<main class="mx-auto max-w-3xl p-8">` — **narrower than the rest of CRM** (`max-w-4xl`). `← Back`, `<h1>` title + contact link + value, stage/status `Badge`s top-right. Three bordered `rounded-lg border p-4` panels (stage/status; note+follow-up; message+consent), then "Messages" and "Activity" sections.
- **Components:** `Badge` + eight local CRM client components (`MoveStageControl`, `LeadStatusControl`, `ActivityComposer`, `TaskForm`, `MessageComposer`, `ConsentToggle`, `MessageHistory`, `ActivityTimeline`).
- **UX problems:** **heading hierarchy is visually inconsistent** — section headings mix `text-sm font-medium` ("Add a note", "Send a message") and `text-lg font-semibold` ("Messages", "Activity") for what are peer sections, so the eye can't parse the page's structure. Seven distinct actions on one screen with no primary emphasis **contradicts the "one primary action per screen" anchor** — everything is equally weighted borders-and-panels. **Why it matters:** this is where the actual selling work happens; the flat visual weighting makes the _next best action_ ambiguous. **A11y:** controls are components (labels unverified here); MoveStage is an accessible `Select` (good, deliberate — no drag-drop). **Mobile:** `flex-wrap` header; panels stack; workable. **Opportunity:** establish a primary action, normalize section heading scale, consider progressive disclosure of messaging/consent.

### Pipeline — board `[read]`

- **Route / file:** `/pipeline` · `.../pipeline/page.tsx`
- **Purpose:** kanban of leads by stage. **Main action:** move a lead's stage (compact `Select` per card). **Secondary:** "List view" link, open lead.
- **Layout:** **two different widths** — empty state `max-w-6xl p-8`, board `max-w-full p-8`. Board = `flex gap-4 overflow-x-auto` of `<section aria-label="Stage …" class="w-72 shrink-0 …">`; leads are `<article>` cards with a `MoveStageControl compact`.
- **Components:** `Badge`, `MoveStageControl`.
- **UX problems:** deliberately no drag-and-drop (accessibility-motivated `Select` — reasonable), but a kanban that you operate via dropdowns rather than dragging will feel unusual; per-column empty is a bare `<p>No leads`. Fixed `w-72` columns with horizontal scroll and no responsive collapse. **A11y: strongest page in the app** — `aria-label`ed stage sections, semantic `<article>`, real `<Link>` titles, counts in badges. **Consistency:** the `max-w-full` board is the only full-bleed screen; empty vs board widths differ. **Opportunity:** unify width; consider optional drag with keyboard-accessible fallback.

---

## E. Bookings & Services (app.saroh.in)

### Services — list `[read via extraction]`

- **Route / file:** `/services` · `.../services/page.tsx`
- **Purpose:** manage bookable services. **Main action:** **New service** (rendered only when `services.length > 0`). **Secondary:** "Bookings" (`variant="outline"`).
- **Layout:** `max-w-4xl p-8`; `<h1>Services`; list = `grid gap-3` **single-column** `Card`s (name, duration, capacity, timezone, status Badge), whole card a `Link`. Empty = dashed card "No services yet / Create a service".
- **UX problems:** single-column card list (vs sites' 2-col) — inconsistent; primary action disappears in empty state. **Opportunity:** align grid with sites.

### Service — detail/edit `[read via extraction]`

- **Route / file:** `/services/[serviceId]` · `.../services/[serviceId]/page.tsx`
- **Purpose:** edit a service + availability. **Main action:** save (inside `EditServiceForm`). **Secondary:** archive; `AvailabilityRulesEditor`.
- **Layout:** `max-w-4xl p-8`; `← Back`, `<h1>` service name + status Badge; two `<section>`s (Details, Availability) with `<h2 class="text-lg font-medium">`. `notFound()` on missing.
- **UX problems:** no page-level save affordance (lives in form); good section structure. **Forms:** `EditServiceForm` + `AvailabilityRulesEditor` are `useState`-based; `AvailabilityRulesEditor` uses native `<select>` **[inferred from component surface]**.

### Service — create `[read via extraction]`

- **Route / file:** `/services/new` · `.../services/new/page.tsx`
- **Purpose:** create a service. `max-w-4xl p-8`; `← Back`, `<h1>Create a service`, `CreateServiceForm`. No description of what a service is.

### Bookings — list `[read via extraction]`

- **Route / file:** `/bookings` · `.../bookings/page.tsx`
- **Purpose:** upcoming reservations grouped by day. **Main action:** cancel a CONFIRMED booking (`CancelBookingControl`). **Secondary:** "Services" (`variant="outline"`).
- **Layout:** `<main class="mx-auto max-w-3xl p-8">`; `<h1>Bookings`; per-day `<h2 class="text-sm font-semibold text-muted-foreground">` group headers over `grid gap-3` card lists. Empty = dashed card. Heavy `Intl` date/tz formatting.
- **Components:** `Badge`, `Button`, `Card` family, `CancelBookingControl`.
- **UX problems:** read-only except cancel; no filter/range, no "past bookings" view; `max-w-3xl` narrower than services. **A11y:** `<section>` per day relies on visual `<h2>`; `truncate`/`min-w-0` guard overflow. **Opportunity:** date filtering; align width with services.

---

## F. Sites (app.saroh.in)

### Sites — list `[read via extraction]`

- **Route / file:** `/sites` · `.../sites/page.tsx`
- **Purpose:** manage tenant sites. **Main action:** **New site** (only when non-empty). **Secondary:** open a site.
- **Layout:** `max-w-4xl p-8`; `<h1>Your sites`; list = `grid gap-4 sm:grid-cols-2` `Card`s (name + `{subdomain}.saroh.in` or `/{slug}`). Empty = dashed card.
- **UX problems:** the "canonical" list pattern, but note it uses a 2-col responsive grid while services (a sibling) uses 1-col — the app has **no single list convention**. Primary action disappears when empty.

### Site — editor `[read via extraction]`

- **Route / file:** `/sites/[siteId]` · `.../sites/[siteId]/page.tsx`
- **Purpose:** edit a site's pages. **Main action:** save/publish (inside `SiteEditor`). **Layout:** `<main class="mx-auto max-w-6xl p-8">` — **widest content page**, and it renders **no server `h1`** (title lives inside the client `SiteEditor` via `siteName` prop). Two `notFound()` guards (missing site; zero pages).
- **UX problems:** **no server-rendered heading** means the app skeleton flashes a titleless editor and screen-reader/SEO get no `h1` until hydration; width jumps from `4xl` (list) to `6xl` (editor). **Why it matters:** the editor is a heavy surface entered from a `4xl` list; the width jump + missing title make the transition feel like a different app. **Opportunity:** server-render at least the title; reconcile width.

### Site — create `[read via extraction]`

- **Route / file:** `/sites/new` · `.../sites/new/page.tsx`
- **Purpose:** create a site from a template. `max-w-4xl p-8`; `← Back`, `<h1>Create a site`, `CreateSiteForm` receiving server-fetched `templates`. No description. Template-picker a11y **[inferred from component surface]**.

---

## G. Store workspace (app.saroh.in `/stores/[storeId]/…`)

> This whole area shares a **store shell** that differs from the rest of the app.

### Store shell `[read via extraction]` + `StoreNav` `[read]`

- **File:** `.../stores/[storeId]/layout.tsx` + `components/stores/store-nav.tsx`
- **Layout:** `<main class="mx-auto max-w-5xl p-8">` (its **own** width, unlike the `max-w-4xl` app norm). A **second header inside the global one**: row of `← Dashboard` + `OrganizationSwitcher`, then `<h1 class="text-2xl font-semibold tracking-tight">{store.name}` + `/{store.slug}`; children in `mt-6`.
- **Sub-nav (`StoreNav`):** `<nav aria-label="Store sections">` of 7 `Link`s (Overview/Products/Orders/Customers/Content/Members/Settings), `flex flex-wrap gap-1 border-b`, active via `aria-current="page"` + `bg-accent`. `usePathname` active logic (`exact` for Overview, else `startsWith`).
- **UX problems:** **two stacked headers and two org switchers** (global `AppHeader` + store shell) — redundant chrome and a double-row of navigation. The store area is the only part of the app with **sub-navigation**, so the mental model shifts from "flat top nav" to "section tabs" only inside stores. `StoreNav` uses `flex-wrap`, so on narrow screens the 7 tabs wrap to 2–3 rows rather than scrolling or collapsing. It's a `<nav>` of links (not `role="tablist"`) — acceptable, `aria-current` is correct. **Why it matters:** the store workspace feels like a nested app; the width + double-header break the "same shell everywhere" anchor.

### Store — overview `[read via extraction]`

- **Route / file:** `/stores/[storeId]` · `.../page.tsx`
- **Purpose:** store home. **Layout:** no own container (`<div class="space-y-6">`, inherits `5xl`). Uses `Card` (title=store.name, description=`/{slug}`), `Badge`, `store.description ?? "No description yet."`; a `COMING_SOON` grid (`sm:grid-cols-2 lg:grid-cols-3`) that is **empty and `hidden`**.
- **UX problems:** read-only and thin — the store "home" shows the store's own name/slug (already in the shell header above it) and an empty coming-soon block, so it **restates the header and shows nothing actionable**. **Why it matters:** the first screen inside a store answers "where am I" twice and "what next" not at all. **Opportunity:** surface real KPIs (orders/revenue/low stock) or route straight to Products.

### Store — settings `[read via extraction]`

- **Route / file:** `/stores/[storeId]/settings` · `.../settings/page.tsx`
- `<div class="space-y-6">`; `<h2 class="text-lg font-medium">Settings` + description; `StoreSettingsForm`. No back link (relies on `StoreNav`). Fields **[inferred from component surface]**.

### Store — members `[read via extraction]`

- **Route / file:** `/stores/[storeId]/members` · `.../members/page.tsx`
- **Purpose:** invite/manage teammates. `<h2>Members` + description; `MembersManager` (gated by `canManage` = owner). Parallel `listMembers`+`listInvitations`.
- **UX problems:** roster + invite live inside `MembersManager` **[inferred from component surface: uses native `<select>` for roles]**; permission conveyed by a prop, so non-owners may see disabled controls rather than a clear "read-only" message.

### Store — products list `[read via extraction]`

- **Route / file:** `/stores/[storeId]/products` · `.../products/page.tsx`
- **Purpose:** catalog. **Main action:** **New product**. **Secondary:** **Categories** (`variant="outline"`).
- **Layout:** `<div class="space-y-6">`; header row `<h2>Products` + description + two Buttons. List = **`<ul class="divide-y rounded-lg border">`**, each `<li>` a full-row `Link` (`flex items-center justify-between p-3 hover:bg-accent`): name+category left, price (`tabular-nums`) + status `Badge` right. Empty = centered bordered card "No products yet" (**no CTA in the empty state** — only the header buttons).
- **UX problems:** **tabular data (name/category/price/status) rendered as flex rows, not a `<table>`** — no column headers, no sortable columns, screen readers read a run-on string, and columns don't align across rows. The header keeps its "New product" button in the empty state (better than the CRM lists) but the empty _card_ offers no action. **Why it matters:** merchants scan catalogs by column; a link-list defeats scanning and sorting. **Consistency:** this `<ul>`-row idiom is used by Orders/Customers/Content too — a **third** list style (vs CRM cards and dashboard grid).

### Store — product edit / new / categories `[read via extraction]`

- **Files:** `.../products/[productId]/page.tsx`, `.../products/new/page.tsx`, `.../products/categories/page.tsx`
- **Edit:** `<div class="space-y-8">`; `← Back to products`, `<h2>{product.name}`; `ProductForm` + `ProductVariants`. **New:** `<h2>New product`, `ProductForm` (no variants on create — variants only appear after the product exists, a discoverability gap). **Categories:** `← Back`, `<h2>Categories`, `CategoriesManager`.
- **Forms:** `ProductForm` is `useState`+action, uses native `<select>` for category **[inferred from component surface]**; **no inline validation** (toast only).
- **UX problems:** create vs edit differ (no variants at create) with no hint that variants come next; back-link glyph-only; no breadcrumb despite 3-level depth (`store ▸ products ▸ product`).

### Store — orders list / detail / new `[read via extraction]`

- **Files:** `.../orders/page.tsx`, `.../orders/[orderId]/page.tsx`, `.../orders/new/page.tsx`
- **List:** `<div class="space-y-6">`; `<h2>Orders` + **New order**; `<ul divide-y>` rows (id/customer left; total `tabular-nums` + status Badge + paymentStatus Badge right). Empty = bordered card.
- **Detail:** `← Back`, `<h2>{order.orderId}` + customer email; items `<ul divide-y>`; totals via a `Row` helper (Subtotal/Tax/Shipping/Discount/Total); mutations in `OrderStatusControls` + `OrderPayments`. **Items-empty not handled.**
- **New:** `<h2>New order`; `OrderForm` fed `listCustomers`+`listProducts`. **No guard when there are zero products/customers** — the form renders anyway, so a merchant can open "New order" with nothing to add. `OrderForm` is a single hand-rolled `useState` form (line-items array, tax/shipping/discount, live total) using native `<select>` **[read: `components/stores/order-form.tsx`]** with **no field-level validation** (`toast` on error).
- **UX problems:** the most complex create form in the app (multi-line-item, money math) has the weakest validation affordance (no `aria-invalid`, no inline errors); two payment/fulfilment badges per row with color-only differentiation.

### Store — customers list / detail / new `[read via extraction]`

- **Files:** `.../customers/page.tsx`, `.../customers/[customerId]/page.tsx`, `.../customers/new/page.tsx`
- **List:** `<h2>Customers` + **New customer**; `<ul divide-y>` rows (name-or-email + email left; `city` **only if present** right — so the right column is ragged/empty across rows). Empty = bordered card.
- **Detail/new:** shared `CustomerForm` (edit passes `customer`; create doesn't) — good reuse. `← Back`, `<h2>` name-or-email. No delete visible.
- **UX problems:** inconsistent right column (city sometimes absent) makes the list look broken; display-name falls back to raw email.

### Store — content list / post edit / new / categories `[read via extraction]`

- **Files:** `.../content/page.tsx`, `.../content/[postId]/page.tsx`, `.../content/new/page.tsx`, `.../content/categories/page.tsx`
- **List:** `<h2>Content` ("Blog posts for your storefront.") + **New post** + **Categories**; `<ul divide-y>` rows (title with inline "Featured" Badge + category·author subline; status Badge right). Empty = bordered card. **Self-documented issue in the file:** the "New post" button shows to _all_ users with access, but the API rejects `VIEWER` writes — so a viewer sees an action that will fail.
- **Post edit/new:** shared `PostForm` (+`categories`); `← Back`, `<h2>`. **Categories:** `PostCategoriesManager`.
- **UX problems:** the misleading "New post" affordance for viewers (no client-side gating) is a concrete guidance defect; create with zero categories still renders (category UX inside the component).

---

## H. Analytics & Notifications (app.saroh.in)

### Analytics `[read via extraction]`

- **Route / file:** `/analytics` · `.../analytics/page.tsx`
- **Purpose:** views/enquiries/sales over a range. **Main action:** switch range (7/30/90d). **Layout:** `<main class="mx-auto max-w-5xl p-8">`; `<h1>Analytics` + description "Last {range} · site views, enquiries and sales"; range = three `Button size="sm"` links (active = `variant="default"`). Chart + top-pages table inside `AnalyticsDashboard`.
- **UX problems:** the range selector is a set of **links styled as buttons with no `aria-current`/`aria-pressed`** — the active range is conveyed by color only, invisible to assistive tech. No site filter visible at page level (passed via `?siteId=`). **A11y:** missing pressed/current state. **Consistency:** `max-w-5xl` (unique to analytics + store shell).

### Notifications `[read via extraction]`

- **Route / file:** `/notifications` · `.../notifications/page.tsx`
- **Purpose:** inbox. **Main action:** mark read (inside `NotificationsInbox`). **Secondary:** "Back to dashboard" (`variant="ghost"`). **Layout:** `<main class="mx-auto max-w-3xl p-8">`; `<h1>Notifications`; delegates list + empty state to `NotificationsInbox` **[inferred from component surface]**.
- **UX problems:** empty/loading states not visible at route level; `max-w-3xl` again diverges. The unread count is computed in the header (`unreadNotificationCount`) _and_ here — two fetches.

---

## Inventory summary — recurring, cross-screen defects

| #   | Defect                                                                                                  | Where                         | Why it matters to users                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Eight container widths** (`md`→`full`); header `6xl` ≠ content `4xl`                                  | everywhere                    | Content visibly shifts/misaligns between screens; the product feels like many apps, breaking the one-product promise.                           |
| 2   | **Three list idioms** (dashboard grid, CRM cards, store `<ul>` rows)                                    | lists                         | Users relearn how to scan each list; tabular data isn't scannable or sortable.                                                                  |
| 3   | **Hand-rolled forms, no inline validation** (`toast`-only, no `aria-invalid`/`role=alert`)              | all create/edit               | Errors appear detached from the offending field; assistive tech gets no error association; the most complex form (orders) is the least guarded. |
| 4   | **Native `<select>` in 10 components** instead of shadcn `Select`                                       | forms                         | Controls look/behave inconsistently inside the same form.                                                                                       |
| 5   | **No per-segment loading/error**; one generic skeleton                                                  | all routes                    | Every navigation flashes the same 4-row skeleton unrelated to the destination.                                                                  |
| 6   | **No breadcrumbs; glyph-only back links**                                                               | detail/create                 | 3-level store paths give no location trail; "where am I" is under-answered.                                                                     |
| 7   | **Primary action hidden in empty states / missing entirely**                                            | contacts, leads, list headers | The core object often can't be created from its own screen (discoverability).                                                                   |
| 8   | **Mobile/tablet has no app navigation** (`hidden lg:flex`, no hamburger)                                | AppHeader                     | Below `lg` the user cannot reach any section.                                                                                                   |
| 9   | **Flat weighting / no single primary action**                                                           | lead detail, store overview   | Contradicts the "one primary action per screen" anchor; next-best-action is ambiguous.                                                          |
| 10  | **Unfinished surfaces shipped** (admin stub, apps light-on-dark, dead code in login, raw error strings) | accounts, admin, invitations  | First-touch trust surfaces read as incomplete.                                                                                                  |
