# Gate W rollout: Marketing Site V2 in waitlist mode

> **Current** (2026-10-03). The runbook for batch `batch-2026-10-03-16`:
> Marketing Site V2 goes live on saroh.in in waitlist mode, with the V2
> waitlist behind it. Decision: DEC-078 (Gate W ships without Pricing).
> Release order: `docs/patterns/devops-tooling-and-deploy.md`; production
> writes need the owner's approval at the time.

## What ships

- **saroh.in:** Home, the eight feature pages, the three solution pages and
  `/waitlist`, the V2 nav and footer (with "Follow Saroh"), SEO, the
  redirects in `apps/saroh.in/redirects.js`, the sitemap and robots.
- **Not shipped:** the Pricing page, its draft and preview, the plan teasers
  and every plan limit or price. `/pricing` is a temporary (302) redirect to
  `/waitlist`. No plans catalogue is installed, and nothing reads one.
- **api.saroh.in:** the V2 waitlist (`POST /public/waitlist` with the new
  fields, referrals and positions), the daily retention sweep,
  `GET /public/waitlist/offer`, and the admin read behind `waitlist:read`.
- **admin.saroh.in:** the Waitlist page (counts by kind, city and source, top
  referrers, filters, remove an entry).

## Order

API first, then the frontends, as every release.

1. **Migrations**, on the production database, in order. There is one:
    1. `20261021110000_waitlist_v2`: additive columns on `WaitlistSignup`;
       `emailKey` and `position` are backfilled for existing rows (in the
       order they joined), then the unique index on `email` is replaced by
       `(emailKey, businessKey)`; plus the one-pending index for the
       `waitlist.retention` job.

    Run it with the API's usual `prisma migrate deploy` step. Check
    afterwards: `WaitlistSignup` row count unchanged, no null `position`.

2. **API (Coolify).** Set, then deploy:
    - `SITE_RELAY_SECRET`: already set for merchant sites; saroh.in now uses
      the same value (below). No change on the API.
    - `LAUNCH_OFFER_DAYS`: the owner's number of days, **only if** the launch
      offer is to show on `/waitlist`. Unset, `GET /public/waitlist/offer`
      answers 404 and the page says the offer is announced at launch.
      Never commit the value.
    - Check: `GET https://api.saroh.in/public/waitlist/offer` answers 200
      with `{ "planId": "grow", "planName": "Grow", "days": … }` when set,
      else 404.
    - Staff who read the waitlist need `waitlist:read` (Support and Owner
      have it); invites keep `waitlist:invite`.

3. **saroh.in (Vercel, project `web`).** Set, then deploy from `main`:
    - `API_URL=https://api.saroh.in` (server-only; already set for the
      waitlist forwarder).
    - `SITE_RELAY_SECRET`: byte-identical to the API's. Unset in production,
      joins still go through but count as one visitor for the rate limit,
      and an error is logged.
    - `NEXT_PUBLIC_LAUNCH_MODE`: leave **unset** (or `waitlist`). Only
      `open` sends start buttons to sign-up; that is Gate O, not this.
    - Nothing pricing-related: no `PRICING_REVALIDATE_SECRET`.

4. **admin.saroh.in (Vercel).** Deploy; no new variables.

## After the deploy

- Open `https://www.saroh.in/`, a feature page, a solution page and
  `/waitlist`: no Pricing in the nav or footer, no plan section, the line
  under the hero reads "Free to start. Move up when you need more."
- `https://www.saroh.in/pricing` answers 302 to `/waitlist`.
- Join the waitlist once with a test address; the done state shows a place
  and a referral link, and the entry shows in the admin Waitlist page.
  Remove it there afterwards.
- **Resubmit the sitemap** in Google Search Console
  (`https://www.saroh.in/sitemap.xml`): the V1 pages are gone and redirect
  (301) to their V2 pages, and `/pricing` is not listed.

## Rollback

- saroh.in and admin: redeploy the previous Vercel deployment.
- API: redeploy the previous image. The migration is additive apart from
  the `email` unique index, which the previous code doesn't need (it only
  looked an address up by it), so it stays in place.
