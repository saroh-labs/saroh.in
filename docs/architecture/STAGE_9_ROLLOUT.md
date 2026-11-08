# Stage 9 rollout: Saroh's plans abroad (Global's first catalogue)

> **Current** (2026-11-08). Steps after the migrations for the release that
> carries stage 9 (USD plans and Saroh's own billing abroad, epic #1306).
> Decision: DEC-211 (Global opens Free-only; `SAROH_BILLING_GLOBAL` stays off
> in production). Release order: `docs/patterns/devops-tooling-and-deploy.md`;
> production writes need the owner's approval at the time.

## What it needs after deploy

Until it has a catalogue of its own, a Global business sits on India's Free
row, priced in rupees. `catalogue:global-free` gives Global its first
catalogue: India's live Free plan alone, in dollars, published as Global's
first version (`installGlobalFreeCatalogue`). Its go-live queues the
Free-rows job, which the API's worker runs to move Global businesses onto it.
It publishes no price and syncs nothing with Razorpay.

When it runs (owner, 8 Nov 2026):

- **Development:** once stage 9 merges to `development` and the dev API is
  deployed with it.
- **Production:** as a step of the release that carries stage 9, after the
  migrations and the API deploy.

It is idempotent: once Global has any version, a second run prints "nothing
to do" and writes nothing. It also does nothing while India has no live
catalogue.

## Order

1. **Migrations**, with the API's usual `prisma migrate deploy` step:
   `20270130100000_pricing_catalogue_edition`,
   `20270130110000_billing_profile_country`,
   `20270130120000_saroh_export_invoice`,
   `20270130130000_saroh_invoice_source_addon`.
2. **API** deployed from the release's image. Leave `SAROH_BILLING_GLOBAL`
   off in production. The export settings (`SAROH_INVOICE_PREFIX_GLOBAL`,
   `SAROH_EXPORT_LUT`) may stay unset: the API starts without them and refuses
   an export invoice with a Needs action row instead.
3. **`catalogue:global-free`**, in a one-off container (below).
4. **Check:** admin's catalogue page for Global shows version 1, live, Free
   only, in USD; within a few minutes no Global business is on an India plan
   row (admin, a Global business's plan says Free in dollars).

## Running it in a one-off container

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

1. Check which database the API container's `DATABASE_URL` names, **host**
   included: development and production have their own database servers, and
   the database names can be the same. Take a snapshot first (`pg_dump -Fc`
   inside that host's database container, as its admin user; the app's role is
   under row-level security, DEV_LEARNINGS 1 Nov).
2. Write the API container's environment to a mode-600 temp file and remove it
   when done (`trap 'rm -f "$ENV_FILE"' EXIT`). Never print it.
3. Run it:

```bash
docker run --rm --network <network> --env-file "$ENV_FILE" --memory 1g \
  -w /repo/apps/api.saroh.in <image> \
  pnpm exec tsx src/cli/catalogue-global-free.cli.ts
```

It prints version numbers only: `published Global's version N, live`, or
`nothing to do` on a second run. Run it once more to see `nothing to do`.

## Undoing it

**Once this has run, don't roll the API back to an image from before stage
9: fix forward.** Before stage 9, the live catalogue read takes the newest live
version of any edition (`liveCatalogueVersion` had no edition), and Global's
Free-only version is numbered after India's, so an older API would read it as
India's catalogue. If a rollback can't be avoided, the owner decides first; it
needs Global's version, its plan rows and Global's Free subscriptions moved
back to India's row by hand before the older image starts.

Rolling back only the Workers is safe. Global's version is never deleted in
the normal course; a business moved to it stays on Free.
