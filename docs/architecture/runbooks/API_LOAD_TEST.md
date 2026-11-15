# Public API load test (plan 2026-11-10-001, U17)

**Purpose:** before the public API and MCP open, prove that one API process
meets the agreed targets on storefront reads, `/v1` and `/mcp`, that it
stays up with Redis gone, and give the owner the numbers to set each plan's
per-minute caps.

**Where:** a seeded copy on your own machine (or a scratch database the
owner names). **Never production, never the development environment, never
any shared host.** `e2e/load/setup.mjs` refuses an API that isn't on
`localhost`; the scripts take every address and key from the environment.
The measured results go in the release PR, not in this repository.

## Targets

The starting targets; the owner agrees the final ones from the first report.
Each script states its own as k6 thresholds and fails the run when one is
missed.

| Surface                                | Rate        | p95      | Failing                        |
| -------------------------------------- | ----------- | -------- | ------------------------------ |
| Storefront reads (`storefront.k6.js`)  | 50 a second | < 300 ms | < 0.5 %                        |
| `/v1` reads (`v1.k6.js`, `reads`)      | 20 a second | < 300 ms | < 0.5 %                        |
| `/v1` writes (`v1.k6.js`, `writes`)    | 5 a second  | < 800 ms | < 0.5 %                        |
| MCP tool calls and lists (`mcp.k6.js`) | 10 a second | < 1 s    | < 0.5 %                        |
| All three at once                      | the sum     | as above | as above                       |
| Redis stopped mid-run                  | as above    | as above | as above, and the API stays up |

Rates are set with `LOAD_RPS` (`LOAD_READ_RPS` / `LOAD_WRITE_RPS` for `/v1`)
and the length with `LOAD_DURATION` (default `2m`).

## 1. A seeded copy

```bash
createdb <scratch-db>
export DATABASE_URL=postgresql://<you>@localhost:5432/<scratch-db> DATABASE_TARGET_CONFIRM=<scratch-db> NODE_ENV=test
pnpm turbo run build --filter=@saroh/api...
(cd packages/database && npx prisma migrate reset --force && pnpm db:seed:showcase)
psql "$DATABASE_URL" -v org=seed_org -v copies=20 -f e2e/load/scale.sql
```

`scale.sql` copies Northwind's customers and orders (with items) `copies`
times and its bookings ten times that, so the `/v1` lists read tables of
realistic size (about ten thousand customers and orders at 20).

## 2. Redis and the API

Run your own Redis on a port nothing else uses, and the built API on a
port nothing else uses (`node dist/main` in `apps/api.saroh.in`). Use the CI
placeholders from `scripts/prepush.sh` (`e2e_stack`) for its secrets, never
real ones, and set:

| Variable                                     | Value for the run                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `PORT`                                       | the API's port                                                                                    |
| `BETTER_AUTH_URL`                            | `http://api.<name>.localhost:<port>`: MCP answers only on the `mcp.` twin of this host            |
| `TRUST_PROXY`                                | `cloudflare`, as in production: the scripts name each visitor in `CF-Connecting-IP` from loopback |
| `REDIS_URL`                                  | your Redis                                                                                        |
| `API_REPLICAS`, `DB_POOL_MAX`                | as production will run them (unset: 1 and pg's 10)                                                |
| `CORS_ORIGIN`, `BETTER_AUTH_TRUSTED_ORIGINS` | include the origin `setup.mjs` signs in from (`LOAD_APP_ORIGIN`)                                  |

Let it run a minute before measuring: the start-up sweeps and the first
requests (cold caches, JIT) are not the steady state.

## 3. Keys

```bash
LOAD_API_URL=http://localhost:<port> LOAD_PASSWORD=<the seed's password> \
LOAD_MCP_ORGS=<comma-separated business ids> \
node e2e/load/setup.mjs > "$TMPDIR/load.env"
```

As staff and the demo owner, through the API, it switches the public API on
for the businesses (`API_STOREFRONT`, `API_SECRET`, `API_MCP`, and the shop's
`SITE_SHOP` and `MODULE_COMMERCE`; `API_MCP` instance-wide too), grants their
API rows with a per-minute limit far above any plan's for a day, so the run
measures the API and not the limiter, and makes a publishable key on a
business with a shop (`LOAD_STOREFRONT_ORG`), a secret key on `LOAD_ORG`, and
one AI-switched secret key per `LOAD_MCP_ORGS` business. The keys are printed
as `export` lines: keep that file out of the repository and delete it after.

A catalogue without an MCP row (the sample one) leaves MCP at the API's
fallback cap, so spread MCP over several businesses (the script uses one key
per business in turn) or import the real catalogue first (`LOCAL_DEV.md`).

## 4. Run

```bash
. "$TMPDIR/load.env"
export LOAD_MCP_URL=http://mcp.<name>.localhost:<port>/mcp
k6 run --include-system-env-vars e2e/load/storefront.k6.js
k6 run --include-system-env-vars e2e/load/v1.k6.js
k6 run --include-system-env-vars e2e/load/mcp.k6.js
# then all three at once, in three terminals or with `&` and `wait`
```

`--summary-export <file>.json` keeps each run's numbers for the report.

**Redis outage.** Start a run, stop Redis about a third of the way in
(`redis-cli -p <port> shutdown nosave`), start it again a third later. The
run must pass its thresholds; the API logs `rate_limit_open reason=redis_error`
at WARN about once a minute while Redis is gone and limits in process at the
cap ÷ `API_REPLICAS`, then `rate_limit_open reason=recovered calls=<n>` once
Redis answers again; `/health/ready` stays 200.

**N+1 check.** Count the SQL each route sends (a `node -r` preload that
wraps `pg`'s `Client.prototype.query` and appends each statement to a file
works) at two page sizes, say `limit=2` and `limit=50`. The count must be
the same: one that grows with the page is an N+1.

## 5. What the owner does with it

**Cloudflare rate rules (owner, before release).** Rate limiting rules on the
production and development zones, as an edge backstop to the API's own
limits (the tunnel skips Traefik, so Cloudflare is the only edge):

- `api.*` paths starting `/v1/` (secret and storefront), per client IP;
- the whole `mcp.*` host, per client IP;
- `api.*` `/api/auth/oauth2/register` and `/api/auth/oauth2/token`, per
  client IP, tighter than the rest.

Set each rule well above what one business's plan cap allows from one
address, so the API's own `429` with `RateLimit-*` headers is what a real
client sees, and the edge only stops floods. Check each with a short burst
from outside and note the rule ids in the release PR.

**Final caps (owner, before release).** The per-minute caps are catalogue
data (`api-storefront`, `api-secret`, `api-mcp` rows), never numbers in the
code. From the report:

1. Take the highest rate each surface held within its targets, all three at
   once, on the production box's size, times the replicas you will run.
2. Divide by how many businesses you expect to be busy on that surface at
   the same moment, and leave room (half is a fair start) for the
   workspace's own traffic, which shares the process and the pool.
3. Set each plan's numbers in the admin console's catalogue editor and
   publish the version. A business's cap changes within a minute.

## Log

| Date | Who | Commit | Result |
| ---- | --- | ------ | ------ |
