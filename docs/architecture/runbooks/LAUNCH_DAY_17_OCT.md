# Launch day, 17 Oct 2026: the marketing site

> **Read when:** opening early access, or deploying `apps/saroh.in` on or
> after 17 Oct 2026. Decisions behind it: DEC-107 (the site is static, and
> nothing deploys on a schedule), DEC-135 (templates off), DEC-136 (plans
> off), `PRODUCT.md` (the two switches that hold sign-up shut).

Nothing on saroh.in changes by itself at midnight. Every page is built when
the site is deployed, and no deploy is scheduled. A page dated 17 Oct
appears with the first production deploy of `web` made after 00:00 IST that
day. Until that deploy the site is exactly what it was the day before.

Opening is the owner's call. This file lists what to do, in order, and what
to look at afterwards. It changes no setting itself.

## What is dated, and what is switched

| Thing                        | What brings it                                                           | Where                                               |
| ---------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| Help (`/help`, its articles) | Any production deploy of `web` on or after 17 Oct                        | `publishOn` in `apps/saroh.in/content/resources.ts` |
| QR code maker                | The same deploy                                                          | the same                                            |
| "Early access is open"       | The same deploy (the changelog's first entry)                            | `content/changelog.ts`                              |
| "How to …" links on features | The same deploy                                                          | `content/feature-help.ts`                           |
| help.saroh.in → `/help`      | The same deploy: 308 to Help from then on, 307 to the home page before   | `lib/help-host.ts`, `proxy.ts`                      |
| "Start free", Sign in        | `NEXT_PUBLIC_LAUNCH_MODE: "open"` in the site's production vars + deploy | `apps/saroh.in/wrangler.jsonc`                      |
| `/waitlist` → sign-up (301)  | The same switch                                                          | `apps/saroh.in/redirects.js` (`launched`)           |
| Sign-up itself               | `PRELAUNCH_GATE: "off"` on accounts + deploy                             | `apps/accounts.saroh.in/wrangler.jsonc`             |
| Pricing, plan sections       | Only if the owner turns plans on. **Off by decision** (DEC-136)          | below                                               |
| Templates                    | Only if the owner says so. **Off by decision** (DEC-135)                 | below                                               |

The help host asks the build, not the clock (`builtContext`): before the
deploy it still sends help.saroh.in to the home page, never to a `/help`
the running build doesn't have.

## Before the day

- [ ] The release with this checklist's code is on `main` and deployed.
- [ ] `pnpm prepush --all` was green on what is being released.
- [ ] Each claim marked **Partly** in `MARKETING_CLAIMS.md` §16 has been
      looked at (own domain in production, the email notice).
- [ ] Search Console has the `https://www.saroh.in` property verified and
      the sitemap submitted (see "Search Console" below).

## On the day, after 00:00 IST

Do these in order. Steps 1 and 2 are one change each to a `wrangler.jsonc`,
merged to `main`; a merge to `main` deploys the apps whose build changed.

1. **Accounts first.** In `apps/accounts.saroh.in/wrangler.jsonc`,
   production `vars`: `"PRELAUNCH_GATE": "off"`. Deploy `auth` to
   production and wait for it to finish.

    Check: `https://accounts.saroh.in/signup` opens in a private window
    with no key, and does not send you to the waitlist.

2. **Then the site.** In `apps/saroh.in/wrangler.jsonc`, production
   `vars`: add `"NEXT_PUBLIC_LAUNCH_MODE": "open"`. Deploy `web` to
   production.

    **Never the other way round.** With the site open and accounts still
    gated, `/waitlist` sends a visitor to sign-up and accounts sends them
    back to `/waitlist`: a loop. If accounts cannot be opened, leave the
    site's switch alone and do step 3 only.

3. **If the switches are not being flipped today**, still deploy `web` to
   production once after 00:00 IST, so Help, the QR code maker and the
   launch entry appear. Either way: admin console › Deployments › web ›
   production, or Actions › "Build and deploy apps on Cloudflare" › Run
   workflow (`app: web`, `environment: production`). A manual run always
   deploys, changed or not.

4. **Leave plans and templates off** unless the owner says otherwise today:
    - `NEXT_PUBLIC_PLANS` stays out of `apps/app.saroh.in/wrangler.jsonc`.
    - `NEXT_PUBLIC_TEMPLATES` stays out of both `wrangler.jsonc` files.
    - No catalogue is published and `PLAN_ENFORCEMENT` stays off
      (`PRICING_ROLLOUT.md`).

    With the site open and no catalogue published, `/pricing` is a page
    again and its plan cards read "Pricing announced at launch"; Home and
    the solution pages draw their plan sections the same way; the nav and
    footer link Pricing. That is what "open with plans off" looks like. If
    the owner does not want a Pricing page with placeholders, say so before
    step 2: it needs a code change, not a setting.

    Once open, the site's build reads the API for the catalogue. No
    catalogue (a 404) is the placeholder; the API down fails the build, and
    the site that was live keeps serving.

## What to check afterwards

On `https://www.saroh.in`, in a private window:

- [ ] `/help` opens and lists its articles; one article opens. Before the
      deploy both were 404.
- [ ] `/tools/qr-code-maker` opens, and Tools in the nav lists it.
- [ ] `/changelog` shows "Early access is open", and
      `/changelog/saroh-is-open` opens.
- [ ] A feature page with Help articles (`/features/bookings`) shows its
      "How to …" links.
- [ ] `curl -sI https://help.saroh.in/selling` answers **308** with
      `location: https://www.saroh.in/help/add-your-first-product`.
- [ ] `/templates` is a **404**, and no menu, footer or sitemap entry names
      it.
- [ ] `/sitemap.xml` lists `/help`, its articles, `/tools/qr-code-maker`
      and `/changelog/saroh-is-open`, each with its `lastmod`, and lists no
      `/templates`.
- [ ] `/llms.txt` lists the same.

If the launch switch was opened (steps 1 and 2):

- [ ] Every start button reads "Start free" and goes to
      `accounts.saroh.in/signup?…`; the nav shows Sign in.
- [ ] `curl -sI https://www.saroh.in/waitlist` answers **301** to
      `https://accounts.saroh.in/signup`, and that page answers 200 (no
      loop).
- [ ] `/sitemap.xml` no longer lists `/waitlist`, and lists `/pricing`.
- [ ] Sign up with a new address end to end: the code arrives, setup
      finishes, the workspace opens.
- [ ] No page shows a price, and no page in the workspace shows a plan
      (`plansShown()` is false).

Static files, on any deploy with this change (first time only):

- [ ] `curl -sI https://www.saroh.in/_next/static/chunks/<any file from the page source>`
      answers `cache-control: public, max-age=31536000, immutable`.
- [ ] `curl -sI https://www.saroh.in/shots/v2/sized/s-home-1280.webp`
      answers 200 with `cache-control: public, max-age=86400, …`, and the
      Home page's source names no `/_next/image`.
- [ ] `curl -sI https://www.saroh.in/tools/link-preview` and the same with
      `?url=saroh.in` answer the same page (one built file).

## Search Console

Nothing in the repo can do these.

- [ ] Sitemaps: `https://www.saroh.in/sitemap.xml` reads "Success", and the
      count matches the file.
- [ ] URL inspection, "Request indexing", for `/features/website`,
      `/solutions/salons`, `/help` and Home.
- [ ] Removals: none needed. `/welcome` is noindex and is no longer
      blocked in robots.txt, so it drops out once it is read.
- [ ] A week later: Pages › "Not indexed" shows no `www.saroh.in/waitlist`
      "redirect error" (it would mean the loop above).

## Rolling back

Each switch goes back the way it came: set the var as it was and deploy
that app. `/waitlist`'s move is a 301, which a browser keeps; closing the
site again brings the page back for new visitors only. Close accounts
(`PRELAUNCH_GATE: "on"`) only after the site is back in waitlist mode, for
the same reason as the order above.
