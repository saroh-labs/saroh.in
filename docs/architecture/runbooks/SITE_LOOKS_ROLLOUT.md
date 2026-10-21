# Website looks: rollout and rollback

How the looks (DEC-172, plan `docs/plans/2026-10-19-003-feat-site-templates-v2-plan.md`)
reach businesses. Only the development step is carried out. Every production
step waits for the owner to say so.

## The switch

`SITE_LOOKS` is an API feature flag (`feature-flags/flags.ts`), set in
admin.saroh.in → Flags, shown as "Website looks".

- **On for a business:** its owner can choose Folio, Quiet or Live in Website ›
  Style on a plan with "Themes, fonts and templates" (DEC-177; on any plan,
  each can be previewed), and a new site starts in its template's look (`TEMPLATE_LOOKS` in
  `@saroh/block-contract`: Live for gyms, Folio for yoga and classes, Quiet
  for the rest).
- **Off:** no look can be set or changed and new sites start Classic. A site
  that already has a look keeps it, keeps the Look row with that look and
  Classic, and can always go back to Classic (`assertLookAllowed`).
- **The renderer reads no flag.** It draws what the publication says, so
  turning the flag off changes no live page.
- Its three readers are in `apps/api.saroh.in/src/modules/sites/site-looks.ts`
  (style saves, site creation, the editor's `looksAvailable`).
- **It is removed when** every site has chosen a look or Classic is retired,
  the looks have been on for every business on every instance for a release,
  and those three readers no longer ask it (the flag's `removeWhen`).

## Owner direction (20 Oct 2026)

- Folio and Quiet are the main looks. Live is an option for gyms and classes.
  The fourth design (C) was dropped.
- `SITE_LOOKS` stays on in development and off in production until the owner
  has tested the looks.
- Existing sites stay Classic until their owner chooses a look.
- Motion is 200 ms or less, with no bounce.
- Launch on today's data: nothing on a site promises what the product can't
  do yet.

## Free and paid styles (DEC-177)

Looks, typefaces and colourways are free or paid. Free ones work on every
plan; paid ones need "Themes, fonts and templates" (`themes`) on the
business's plan, which today is on no plan. Which are free is the live
catalogue's, ticked in admin.saroh.in → Plans and modules → Modules, under
the matrix ("Free looks, typefaces and colourways"), and published like any
other catalogue change.

- **Classic is the only free look** (owner, 21 Oct, superseding the 20 Oct
  choice that all four start free). Quiet, Folio and Live come with paid
  plans. They stay tickable in admin, so the owner can make one free later.
- Always free, whatever is ticked: Classic, the visitor's system font, each
  site's own template typefaces and the colourway it was made in, and
  whatever a site already has (going back to it is always allowed).
- The sample catalogue frees no look beyond Classic, and no typeface or
  colourway beyond the always-free ones.
- Each look in the Look row has a Preview, on every plan. "Use this look"
  in it follows the same rule.
- A list published in admin applies to every business at once, with no
  deploy. Rolling it back is publishing a version without the tick.

## Before turning anything on in production

What reaches every site, Classic included, ships only in a release the owner
approves, named in its release notes:

- [ ] The booking page's step in the address (`/book?service=…&step=…`).
- [ ] Live facts read in the browser ("Next free", places left, "Open now").
- [ ] The customer's data-removal request and Sell › Customers › Requests.
- [ ] `lang="en-IN"` on every merchant page (it was `en`).
- [ ] Photos sized for the screen: on development only. Production needs
      `NEXT_PUBLIC_SITE_MEDIA_URL` in the production `vars` of
      `apps/saroh.app/wrangler.jsonc`, which the owner approves separately.

Look code is inert for Classic: with no look, a site renders and moves as it
did, which the `classic-pin` tests hold.

Also before the first production business:

- [ ] The owner turns "Themes, fonts and templates" (`themes`) on for the
      paid plans in admin → Plans and modules, and publishes the version
      (DEC-177). Without it, no production business can choose Quiet, Folio
      or Live: Classic is the only free look.
- [ ] The owner ticks the free typefaces and colourways (a few of each) in
      the same place, under the matrix, and publishes. Ticking free looks
      is no longer needed.

- [ ] Capture the Look row's phone pictures (until then each is drawn in the
      business's colours with the look's corners and heading face):
      `pnpm --filter sites build:templates`, then
      `pnpm --filter sites start:templates`, then
      `pnpm --filter @saroh/e2e shots:templates --looks`. Commit
      `apps/app.saroh.in/lib/sites/look-thumbnails.ts`.
- [ ] The Help article for Website › Style names the looks.

## Steps

1. **Development (saroh.io).** The global flag is on.
    - [ ] To test a look on saroh.io, the test business needs `themes`:
          put it on a plan that includes the row, or turn the row on for its
          plan and publish (or grant the row to that business alone, a
          module override on its admin page), and turn `SITE_LOOKS` on for it in
          admin → Flags if the global flag is off. On a plan without
          `themes` (with "Plan limits" on), Quiet, Folio and Live say "Paid
          plans" and are refused in place; Classic always saves.
    - [ ] Northwind checked in all three looks, desk and phone, by the e2e
          matrix (`site-looks-quality.spec.ts` and the looks specs) and by hand
          at 320, 390 and 1440 px, in the merchant's colours and in the
          neutral defaults.
2. **Production, chosen businesses (owner only).**
    - [ ] Turn on an override in admin → Flags for each business the owner
          picks. Never the global flag at this step.
    - [ ] Their owners preview a look (its Preview button), pick it and
          publish. On a plan without `themes`, every look but Classic says
          "Paid plans" and is refused in the row, with See plans.
    - [ ] Watch the page cache's hit rate, the image route's errors (if
          resizing is on) and the home page's LCP for those sites.
3. **Production, new sites (owner only).**
    - [ ] Turn the global flag on. New sites start in their industry's look;
          existing sites stay Classic with the Look row offered.
4. **Existing sites.** They are offered looks only from the Website › Style
   row, with no card in the workspace. Classic is always one choice away.
   Retiring Classic is a separate decision.

No agent and no unit turns on a production override or the production global
flag.

## Rollback

Turn the flag off (the override, or the global row). New look choices stop.
Published looks keep rendering, and each owner can still go back to Classic
from the Look row and publish. Nothing needs a deploy.

## Known gaps

- With `SITE_ACCOUNT_AREA` off, the middleware answers `/account` with a 404
  before the site is known, so a look's "Sign-in isn't used on this site" page
  shows only in the owner's preview.
- There is no "being baked" stage for an order: a pick-up being prepared reads
  "Being made · for pick-up" (`site-blocks/src/account/status-words.ts`).
- Two Classic motions stay on the motion check's allow-list, each with its
  reason (`ALLOWED` in `scripts/check-site-motion.mjs`): Classic's sections
  rising on scroll, and its account cards' loading pulse. Both are stopped
  under a look. The list only shrinks.
- Phase 2 data (staff photos and bios, service pages, service reviews, slots
  with a real cut-off, Order again and Book again) is drawn on the boards but
  not built; each look falls back to today's data until it lands.
