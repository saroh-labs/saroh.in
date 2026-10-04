---
title: "feat: Resources pages on saroh.in (Help, Integrations, Changelog, Templates, Link preview tool)"
type: feat
status: active
date: 2026-10-04
origin: claude.ai/design project — Saroh Resources - *.dc.html, Saroh Resources Audit.dc.html (3 Oct 2026)
---

# Resources pages on saroh.in

## Problem frame

The marketing site (Marketing Site V2, live since Gate W, DEC-078) explains what Saroh does. An owner deciding whether to trust it has nowhere to check: no help, no list of what connects, no sign the work keeps shipping, no way to see what their site would look like. Nine Resources pages were designed and audited on 3 Oct (22 findings, 17 fixed in the designs). This plan builds them into `apps/saroh.in` and sequences them around early access on **Saturday 17 Oct 2026**.

The design's own summary of the job: _Help proves it's simple, Integrations proves the money stays theirs, Templates proves it'll look like their business, the changelog proves the work keeps coming, and the link preview tool is the one a stranger finds through search._

## Scope

| Page              | Route                                       | Design                                | Goes live                                                                         |
| ----------------- | ------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| Link preview tool | `/tools/link-preview`                       | Link Preview Tool (1b) + Open variant | **Early**, before 17 Oct (decided 3 Oct)                                          |
| Integrations      | `/integrations`, `/integrations/[provider]` | Integrations 2a + Razorpay            | Before 17 Oct (claims verified against code)                                      |
| Changelog         | `/changelog`, `/changelog/[slug]`           | Changelog 1a + "Saroh is open"        | Page before 17 Oct in its pre-launch state; the launch entry publishes **17 Oct** |
| Help              | `/help`, `/help/[slug]`                     | Help 1a + article 2a                  | **17 Oct**, not before (decided 3 Oct)                                            |
| Templates         | `/templates`, `/templates/[slug]`           | Gallery 1b + detail 2a                | Blocked: see U6                                                                   |

All pages live in `apps/saroh.in` beside Features and Solutions: same nav, footer, tokens, light mode only, the V2 components in `apps/saroh.in/components/v2`. The main button on every page is **"Get early access"** (R22).

**Out of scope:** pricing (held, DEC-078), anything in "not in marketing for now" (courses, packs, WhatsApp messaging, automations, AI, social publishing), a blog, search across Resources.

## What the code already says (research, 4 Oct)

- `apps/saroh.in` has only `(v2)` Home, `features/[slug]`, `solutions/[slug]`, `(standalone)/waitlist` and `api/waitlist`. No Resources routes, no Privacy or Terms page, and the footer has no legal links.
- `apps/help.saroh.in` and `apps/docs.saroh.in` are separate Nextra (MDX) apps. `apps/templates.saroh.in` (`ecom-templates`) is a separate app. None matches the Resources designs.
- **Integrations are real:** Razorpay and Cashfree both have per-business webhooks at `/public/webhooks/razorpay/:organizationId` and `/public/webhooks/cashfree/:organizationId` (`apps/api.saroh.in/src/modules/payments/webhook-setup*`). Email to customers goes through `communications/providers`. Every claim on the integration pages is checked against these files (R4).
- **Share previews exist as drawings:** `apps/app.saroh.in/components/sites/share-cards.tsx` draws the Facebook, LinkedIn, WhatsApp, Slack and X cards from title, description, image and domain, and says plainly that they are drawings. The tool reuses it.
- **No URL fetcher exists, and no SSRF guard.** The link preview tool needs both (U2).
- **Templates in code are generic:** `packages/templates/src/templates/` has `starter`, `personal`, `portfolio`, `writing`. The gallery's eight (Bakery, Gym, Salon, Clinic, Store, Dietician, Studio, Blogs) exist only as designs (`templates/*.dc.html`); Salon and Clinic aren't designed yet. Marketing may show only what's built, so U6 is blocked on the industry templates.

## Key technical decisions

- **KTD-1 One site.** Resources pages are routes in `apps/saroh.in`, not the Nextra apps. Content is MDX under `apps/saroh.in/content/{help,changelog,integrations}` with typed frontmatter, validated by the existing `content/validate.ts` pattern so a missing field fails the build. `help.saroh.in` and `docs.saroh.in` redirect to `saroh.in/help` once Help is live. Retiring those apps is a separate decision (open question 4).
- **KTD-2 Publish by date, not by deploy.** Each MDX entry has `publishOn` (a date in Asia/Kolkata). A page or entry whose date hasn't come is not listed, not in the sitemap, and returns 404, so Help and the launch entry can merge before 17 Oct and appear on the day with no deploy. A single helper `isPublished(date, now)` is tested at the day boundary. For a preview, a `RESOURCES_PREVIEW` env flag shows unpublished entries on preview deployments only, never production.
- **KTD-3 The tool fetches through the API.** `GET /public/tools/link-preview?url=` lives in a new `apps/api.saroh.in/src/modules/link-preview` module. It is the only server that fetches a stranger's URL:
    - https/http only; resolve DNS first and refuse private, loopback, link-local, CGNAT and metadata addresses, IPv4 and IPv6, including after each redirect (max 3);
    - 5s total timeout, reads at most 512 KB of HTML, then parses `<head>` only;
    - image facts by HEAD (or a ranged GET), never by downloading the image;
    - per-IP rate limit (the waitlist relay's throttler), 60s cache per normalised URL;
    - returns facts (title, description, image URL/size/type, site name, twitter card, canonical, status), never the page.
      The marketing app calls it from a route handler, as `api/waitlist` does (`SITE_RELAY_SECRET`).
- **KTD-4 One share-card drawing.** `share-cards.tsx` moves to `packages/ui` (or `packages/site-blocks`) so the app and the tool draw identical cards. The six free previews are Facebook, LinkedIn, WhatsApp, Slack, X and Google. Under the grid: "Close to what each app shows today. Apps change their cards from time to time." plus a last-checked date (R12).
- **KTD-5 Emails go to the waitlist's store.** The changelog's "Get one email when something ships" and the tool's report email (if gated) reuse `WaitlistEntry` with a `source` (`changelog`, `link-preview`). There is one consent line and one unsubscribe, and no second list.
- **KTD-6 Real screens only.** Help steps, integration steps and template thumbnails use captured screenshots from the existing `content/shots.ts` pipeline (`shots.captured.ts`), not HTML mock screens (R7, R18). The saffron step markers stay as an overlay.

## Implementation units

### U1. Resources frame: nav, footer, legal, layout

**Goal:** the shared pieces every Resources page stands on.

- Nav: a **Resources** menu (Help, Integrations, Changelog, Templates, Link preview tool) in `components/v2/nav-items.ts`, `site-nav.tsx` and `mobile-menu.tsx`. Unpublished pages are left out of the menu (KTD-2).
- Footer: a Resources column, plus **Privacy**, **Terms** and "A product of Virashi Softwares LLP" (R6). This needs `/privacy` and `/terms`. **Their text is the owner's (legal), not ours:** placeholder routes do not ship.
- `components/v2/resources/`: breadcrumbs, a responsive side nav that becomes a "Topics" menu under 900px, "On this page" from 1100px, and the next/previous links (R1).
- `content/resources.ts`: the page list, which drives nav, footer, sitemap and breadcrumbs from one place.
- Sitemap (`app/sitemap.ts`) and `robots.ts` list only published pages.

**Files:**

- `apps/saroh.in/components/v2/{nav-items.ts,site-nav.tsx,mobile-menu.tsx,site-footer.tsx}`
- `apps/saroh.in/components/v2/resources/*`
- `apps/saroh.in/content/resources.ts`
- `apps/saroh.in/app/sitemap.ts`
- `apps/saroh.in/app/(v2)/{privacy,terms}/page.tsx`

**Tests:**

- `content/resources.test.ts`: an unpublished page is in neither the nav nor the sitemap; the day boundary falls at midnight IST.
- `site-nav.test.tsx`: the Resources menu has keyboard open/close and Escape.
- e2e `resources.spec.ts`: every Resources link resolves (no 404 and no self-link, R2 and R8 as a class), and there's no sideways scroll at 390px.

### U2. Link preview tool (early)

**Goal:** a stranger pastes their link and sees how it looks on six apps, with what to fix, in plain words.

- **API:** the `link-preview` module (KTD-3), with a DTO, controller, service, SSRF guard (`ssrf-guard.ts`) and parser (`og-parse.ts`).
- **Page `/tools/link-preview`:**
    - **States (R5):** empty (a big input and three example chips), loading, couldn't reach the site, no tags found, and results.
    - **Input:** pasting a full address never doubles the scheme (R19).
    - **Result:** the six drawn cards (KTD-4); "Looks right on N of 6 apps. Fix M things to fix all 6." then the list of fixes (R14); "Check again".
    - **Shareable:** each result has its own address, `?url=…`, with "Copy link to this report" (R13).
- **Version (open question 1):** fully open, or email-gated (an email unlocks Telegram, Discord, iMessage and Pinterest plus the fix-it report). If gated:
    - copy: "We'll show it here and email you a copy. No newsletter unless you tick the box." with a consent tickbox (R6);
    - the report email is sent through the existing mail provider;
    - the Privacy page (U1) must be live first.
- **SEO:** a definition paragraph first ("A free check of how your link looks when shared…"), FAQ JSON-LD, and a `SoftwareApplication` schema.

**Files:**

- `apps/api.saroh.in/src/modules/link-preview/*`
- `apps/saroh.in/app/(v2)/tools/link-preview/page.tsx`
- `apps/saroh.in/app/api/link-preview/route.ts`
- `apps/saroh.in/components/v2/tools/*`
- the share-cards move (KTD-4)

**Tests:**

- `ssrf-guard.spec.ts`:
    - refuses `127.0.0.1`, `10/8`, `172.16/12`, `192.168/16`, `169.254.169.254`, `100.64/10`, `::1`, `fc00::/7` and `fe80::/10`;
    - refuses a public host that resolves private, and a redirect to a private host;
    - refuses a non-http scheme and an over-long URL.
- `og-parse.spec.ts`:
    - reads `og:*`, falls back to `<title>` and `twitter:*`, resolves a relative `og:image`, survives a 2 MB page by stopping at 512 KB, and ignores tags in `<body>`.
- `link-preview.controller.spec.ts`: rate-limited, cached, and errors come back as typed states, never 500.
- Unit: the fix list and the "N of 6" sentence come from the same facts.
- e2e `link-preview.spec.ts`, against a fixture page served by the test stack:
    - each state, the share URL round-trip, and the paste-a-full-URL case;
    - at 390px, the six cards with no sideways scroll.

### U3. Integrations

**Goal:** an owner sees that the money goes straight to them and how to connect it.

- `/integrations`: live (Razorpay, Cashfree, Your own email) and Planned (dashed rows, "not available yet").
- `/integrations/[provider]`: one page component for every provider, from MDX. Steps, then the webhook URL and secret step. **Every path, event name and setting is copied from the code and cited in a comment in the MDX** (R4): `webhook-setup.ts` for the URL shape and events, and the payment settings screen for field names.
- Card signifier: the Settings path as text ("Settings › Payments") and one "See Razorpay →" link, with no second Connect pill (R9).
- Official partner marks under each partner's brand rules (R21). Until they're in hand, the provider name is set in type, never a letter tile.

**Files:**

- `apps/saroh.in/app/(v2)/integrations/{page.tsx,[provider]/page.tsx}`
- `apps/saroh.in/content/integrations/{razorpay,cashfree,email}.mdx`
- `content/integrations.ts`

**Tests:**

- `content/integrations.test.ts`: the webhook path in each MDX matches a shared constant the API's `webhook-setup` also uses, so docs can't drift. It lives in a frontend-safe package, since frontends never import the API or `@saroh/database`. Planned rows never link.
- e2e: each provider page renders its steps, with no link back to itself.

### U4. Changelog

**Goal:** proof the work keeps coming.

- `/changelog`:
    - before 17 Oct, the pre-launch state: "First entry on 17 October", Coming next (Google Calendar, Meet/Zoom, CSV import, Shopify import, social publishing, each marked "not available yet"), and one email field (R15, R16; KTD-5);
    - from 17 Oct, the entries, newest first.
- `/changelog/saroh-is-open`: the launch entry, `publishOn: 2026-10-17` (KTD-2). It describes only what's built.
- No RSS until it exists (R16). Each entry gets an OG image.

**Files:**

- `apps/saroh.in/app/(v2)/changelog/{page.tsx,[slug]/page.tsx}`
- `apps/saroh.in/content/changelog/*.mdx`
- `content/changelog.ts`

**Tests:**

- Unit: the pre-launch state before the first `publishOn`, entries after; "Coming next" items never link.
- e2e: the email field joins the list (`source=changelog`) and shows its confirmation; a second join with the same email is not an error.

### U5. Help (17 Oct)

**Goal:** the first ten jobs, each as one article with a screen per step.

- `/help`: topics and tasks. Counts are shown only once real, and every task link opens its own article (R17).
- `/help/[slug]`, design 2a:
    - one job and its steps, each with a real screenshot (KTD-6), a tip only where needed, and Next links;
    - "Updated" is the real last-edited date (R20).
- **The first ten articles** (from the audit): create your business, connect Razorpay, connect Cashfree, set your team's hours, take a deposit, set up a monthly plan, take your first order, connect your domain, make your link look right, add your GSTIN. Plus "Add your first product", which is already designed.
- **Every setting named in an article is checked against the screen it names before merge** (R7). The reviewer opens the screen.
- `help.saroh.in` redirects to `saroh.in/help` from 17 Oct (open question 4).

**Files:**

- `apps/saroh.in/app/(v2)/help/{page.tsx,[slug]/page.tsx}`
- `apps/saroh.in/content/help/*.mdx`
- `content/help.ts`
- screenshot captures in `content/shots.ts`

**Tests:**

- Unit: every task links to a published article; an article without screenshots for its steps fails validation.
- e2e: the article's side nav becomes the Topics menu at 390px and Next walks the set; nothing is listed before `publishOn`.

### U6. Templates (blocked)

**Goal:** an owner sees their kind of business as a finished site.

- **Blocker:** the eight industry templates aren't in `packages/templates` yet. Salon (Kesar Salon) and Clinic (Kavi Dental) are not designed yet, and the others exist only as `.dc.html`. Showing them would promise what isn't built, so this page ships **only with templates a merchant can actually pick**.
- **When unblocked:**
    - `/templates`: a gallery filtered by the seven kinds of business (R3), with real 2× thumbnails rendered from each template (R18);
    - `/templates/[slug]`: one detail page per template, from data (R2);
    - before 17 Oct the button is "Save {template} for launch day" (joins the waitlist with `template=…`, R10); after, "Use this template" goes to sign-up with it preselected;
    - check each claim against the editor (R11).
- **Unblocking work** is its own plan: port the designed templates into `packages/templates` as real templates the site editor can create from.

**Files (when unblocked):**

- `apps/saroh.in/app/(v2)/templates/*`
- `apps/saroh.in/content/templates.ts`

### U7. Being found

- Per page: a title, one H1, a meta description, canonical, an OG image and a first-paragraph definition.
- `/llms.txt` lists Resources.
- JSON-LD: `HowTo` on help articles, `SoftwareApplication` on the tool, `Article` on changelog entries.
- Internal links:
    - Features → the matching help article;
    - Solutions → the matching template, once U6 ships;
    - the waitlist → Integrations ("your money goes straight to you").

## Sequencing and release

The rule from AGENTS.md applies: units merge locally into one batch branch, and each batch is pushed once.

1. **Batch R1 (now → ~9 Oct):** U1 (without Privacy/Terms text unless the owner supplies it), U2 (open version, or gated if Privacy is ready), U3, and U4 in its pre-launch state. Release to production; owner merges `main`.
2. **Batch R2 (by 15 Oct):** U5's ten articles, screenshots and fact checks, the launch changelog entry, and U7. Merged and released **before** 17 Oct, all dated `publishOn: 2026-10-17`, so they appear on the day without a deploy (KTD-2). Verify on the day: `/help` and `/changelog/saroh-is-open` live, and the nav shows Help.
3. **U6:** after the industry-templates plan ships.

**Verification for every unit:**

- `pnpm prepush --all`;
- browser walk at 1440px, ~924px and 390px of every state;
- the marketing playbook's consistency check (product truth, voice, one CTA, ₹ format);
- a link checker over the built site: no 404s and no self-links.

## Risks

- **SSRF in the tool** is the one security-sensitive piece. It gets its own review (`ce-security-reviewer`) before merge, and the guard is unit-tested against every private range and a DNS rebinding case.
- **Wrong help is worse than no help.** The R7 rule (open the screen before merging the article) is the control.
- **Partner logo use** needs each partner's brand terms. Text names until then.
- **Cost and abuse of the tool:** rate limit, cache, timeouts and size cap (KTD-3). Watch request volume after launch.

## Open questions (owner)

1. **Link preview tool:** fully open, or email-gated? Gated needs Privacy and Terms live first.
2. **Privacy and Terms:** who writes them? They're needed in the footer either way (R6).
3. **Templates:** build the industry templates before showing a gallery (recommended), or ship `/templates` with the four generic ones and add the rest later?
4. **help.saroh.in and docs.saroh.in:** redirect both to `saroh.in/help` and retire the Nextra apps, or keep docs for developers (self-hosting)?
5. **The marketing context file says early access opens 17 Oct.** Confirm the date before the launch entry and Help are dated.
