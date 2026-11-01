# Demo businesses: make or refresh the demo salon and gym (#1191)

**Purpose:** put the two businesses behind saroh.in's "See a live demo" on a
database: a salon at `demo-salon` and a gym at `demo-gym`. DEC-188 says what a
demo is; this is how to make one.

**What it writes** (`packages/database/src/backfill/demo-businesses.ts`), on
fixed ids (`demo_salon…`, `demo_gym…`):

- the business, with `Organization.isDemo` true: every public write refuses it
  ("This is a demo business…") and its owner can't sign in;
- its site, published at its address, and its booking page: services, the
  people who take them and their weekly hours, the gym's class times, booking
  rules, opening hours, packs and memberships, from the showcase's Gulmohar
  Salon & Bridal and Pulse Fitness;
- Pro through an admin plan override (no end date) and **no subscription**,
  so nothing reads as paused or over a limit and the renewal job never sees it;
- an owner at `demo-salon-owner@example.com` / `demo-gym-owner@example.com`:
  made directly, not through sign-up (no `signed_up` event), with no password
  and no other business.

No bookings, customers, orders or invoices. Each run is one transaction. A
second run adds no row; `--dry-run` does the same work and rolls it back, and
says how many rows it would add.

It refuses to run if either address is already another business's. It warns,
without failing, when no catalogue version is live or the live one has no Pro
plan: the override then reads as nothing until one is.

## Locally

The guard allows `saroh-dev` (and a database on this machine) without a
confirmation.

```bash
pnpm --filter @saroh/database db:demo-businesses --dry-run   # what it would add
pnpm --filter @saroh/database db:demo-businesses
pnpm --filter @saroh/database db:demo-businesses --dry-run   # must say: would add 0 row(s)
```

Then open `https://demo-salon.saroh.app.localhost` and
`https://demo-gym.saroh.app.localhost` (portless). Both open; Book, Pay and
the enquiry forms say "This is a demo".

## Production, in a one-off container

Never run tooling inside the serving API container: it shares the API's memory
limit (DEV_LEARNINGS, "one-off container"). Run a one-off container from the
same image the API serves, on the host that runs it. Everything below is a
placeholder; hosts, container names and credentials stay in the operator's
notes, never in this repository.

| Placeholder  | Meaning                                                 |
| ------------ | ------------------------------------------------------- |
| `<image>`    | the image the API container is running                  |
| `<network>`  | the Docker network the API reaches its database on      |
| `<env-file>` | the API container's environment, written to a temp file |
| `<database>` | the production database's name, as in its URL           |

1. Take a snapshot of the database first. Take the database **host** and name
   from the target API container's `DATABASE_URL`, check the host is the one you
   mean (each environment has its own database server, and the database names
   can be the same), and run `pg_dump -Fc` inside that host's container as its
   admin user. The app's role is under row-level security, so a dump made as the
   app role fails or comes out partial (DEV_LEARNINGS, 1 Nov).
2. Write the API container's environment to a mode-600 temp file and remove it
   when done (`trap 'rm -f "$ENV_FILE"' EXIT`). Never print it.
3. Dry run, the run, then a dry run again that must write 0:

```bash
docker run --rm --network <network> --env-file "$ENV_FILE" \
  -e DATABASE_TARGET_CONFIRM=<database> --memory 2g \
  -w /repo/packages/database <image> \
  pnpm exec tsx src/backfill/demo-businesses.cli.ts --dry-run

# the same without --dry-run, then once more with it: "would add 0 row(s)"
```

`DATABASE_TARGET_CONFIRM` must equal the database name in `DATABASE_URL`, or
the guard refuses before anything connects.

4. Open both sites at their addresses on production and check they read as a
   demo, not as paused.

## Photos

The fixtures' photos are links: Unsplash images, and a few files the local app
serves (`https://app.saroh.localhost/demo/…`, `DEMO_ASSET_BASE`). Locally
both show. On production the local-app links don't resolve, so those images
are missing until the demo's photos are hosted through the media store; that
is deferred (plan `2026-10-24-001`, U8, "How the demo's photos travel to
production").

## Changing a demo

Edit the fixture (or the spec in `demo-businesses.ts`) and run it again.
Services, hours, packs and memberships are upserted in place. A Publication
is never rewritten, so a change to what the **site** shows needs
`SITE_REVISION` bumped, or the live site keeps showing the old one.

## Removing one

There is no undo script. Deleting the `Organization` row (`demo_salon` or
`demo_gym`) cascades to what it owns; delete the owner `User` row after it.
