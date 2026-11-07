# Launch day: saroh.tech and the Global edition

> **Read when:** opening the Global edition to the public on saroh.tech,
> app.saroh.tech, accounts.saroh.tech, admin.saroh.tech and api.saroh.tech,
> or rolling it back. Decisions behind it: DEC-204 (editions), DEC-208
> (merchants' own Stripe), DEC-211 (Global opens Free-only and email only;
> Saroh's own Global billing stays off). Exact console values and DNS records
> live in the private launch checklist, not here: this repo is public.

Nothing about Global is reachable on a saroh.tech host before the launch
step. Every push to main deploys the four Global Workers (`saroh-tech` and
the `*-global` variants of the workspace, accounts and admin), but with no
routes and no workers.dev address while the repo variable `GLOBAL_ROUTES`
isn't `on`, and no DNS points at them. api.saroh.tech has no DNS record and
no tunnel rule until the launch step either.

Opening is the owner's call. No step is scheduled.

## Before the day (owner)

Each is a gate: launch only when all are done.

1. **Cloudflare token:** `CLOUDFLARE_SITES_DEPLOY_TOKEN` can edit Workers
   Routes and read the saroh.tech zone, so the deploy's "Routes fail open"
   step works there.
2. **GitHub environment:** `GLOBAL_DEV_DOMAIN` is readable by the
   `cloudflare-production` environment (a repo secret, or added there), so
   the production host check also refuses the Global development domain.
3. **Turnstile:** the API's widget lists saroh.tech, accounts.saroh.tech and
   app.saroh.tech, and the repo variable `TURNSTILE_SITE_KEY` holds its
   public key (saroh.tech's "Tell me when").
4. **API settings (Coolify):** if `CORS_ORIGIN` or `BETTER_AUTH_TRUSTED_ORIGINS`
   is set on the production API, it names the five saroh.tech origins. Unset,
   the built-in list already does.
5. **Sign-in providers (optional):** Global launches with email codes. Google
   on Global needs saroh.tech on the OAuth consent screen's authorized
   domains and the `api.saroh.tech` callback. GitHub needs its own OAuth app,
   set as `AUTH_GITHUB_GLOBAL_ID` and `AUTH_GITHUB_GLOBAL_SECRET`; without
   both, GitHub stays off on Global.
6. **Mail:** the saroh.tech identity is verified in SES (done 7 Nov 2026), so
   Global mail comes from `noreply@saroh.tech` and `codes@saroh.tech`.
7. **Stripe:** on a Global development business, a test-mode payment is
   taken, refunded and cancelled through the checkout window (the
   `STRIPE_PAYMENTS` flag's own condition).
8. **Legal:** the lawyer has read saroh.tech's Privacy, Terms, Refunds and
   Cookies pages.

## The launch step

1. Add the DNS: proxied records for saroh.tech, app, accounts and admin, and
   the CNAME plus tunnel ingress rule for api.saroh.tech (to the production
   API, as api.saroh.in is).
2. Set the repo variable `GLOBAL_ROUTES` to `on`, then run "Build and deploy
   apps on Cloudflare" by hand: app `all-global`, environment `production`.
3. In admin, set the `STRIPE_PAYMENTS` default to on. India can't connect
   Stripe (its edition's providers), so this opens it for Global only.
4. Run `node scripts/smoke-global.mjs`. It must end "all passed".
5. By hand: request a sign-in code on accounts.saroh.tech and check it
   comes from saroh.tech, and open a Global business from the workspace.

## Rollback

In this order, any subset as needed:

1. `STRIPE_PAYMENTS` default off in admin.
2. Delete the five DNS records and the api.saroh.tech tunnel rule. Global is
   unreachable at once.
3. Set `GLOBAL_ROUTES` off and redeploy `all-global`, so the Workers carry
   no routes again.
4. If Stripe stays off, revert the commit that says customers can pay by
   card online (saroh.tech's Features, FAQ, Help and Contact, all four) and
   redeploy `tech`, so the site never claims what is switched off.

## After

- Saroh's own Global billing (stage 9) stays off in production until the
  owner turns on `SAROH_BILLING_GLOBAL` (DEC-211).
- Session replay is off on the Global apps until a consent decision.
