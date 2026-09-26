# Load smoke: public paths (#106)

**What:** `scripts/load-smoke.mjs` sends closed-loop load at the four paths a
merchant's customers hit: the enquiry form, the booking slot read, booking
create, and checkout. It records p50/p95/p99 and the error rate. It has no
dependencies (Node's `fetch`), and it **refuses any target that isn't
localhost**, because it writes enquiries and bookings.

**What it isn't:** a capacity test. It runs on one laptop against one API
process, with the database on the same machine. Its job is to find a slow
query, a lock, or an error that only appears under concurrency. It found one
(below).

## How to run it

1. Bring up the seeded local stack (CI's `browser-e2e` shape: its own
   database, `db:migrate:deploy`, `db:seed:showcase`, then `pnpm --filter
@saroh/api start`).
2. Start the API with `TRUST_PROXY=private`, so it reads the script's
   per-visitor `X-Forwarded-For`, as production reads Cloudflare's.
   Otherwise every request is one visitor, and the rate limits answer 429
   almost at once.
3. `node scripts/load-smoke.mjs --seconds 20 --concurrency 10`. Options:
   `--only enquiry,slots,book,checkout`, `--service <id>`, `--form <id>`,
   `--order <id>`, `--one-visitor`.

## Results (2026-09-26)

Apple M4 Pro, 12 cores, Node 24, Postgres 17 local, one API process
(`node dist/main`, the production build), showcase seed. 10 concurrent clients per
path for 20 s, each request from its own simulated visitor.

| Path                                                        | Requests | req/s | p50 ms | p95 ms | p99 ms | 5xx rate | Answers          |
| ----------------------------------------------------------- | -------: | ----: | -----: | -----: | -----: | -------: | ---------------- |
| Enquiry: `POST /public/forms/:id/submit`                    |   17,246 |   862 |   11.0 |   15.2 |   22.7 |    0.00% | 201              |
| Slot read: `GET /public/services/:id/availability` (7 days) |   22,066 | 1,103 |    8.6 |   11.8 |   16.3 |    0.00% | 200              |
| Booking create: `POST /public/services/:id/book`            |   14,827 |   741 |   12.9 |   18.2 |   26.1 |    0.00% | 409 (class full) |
| Checkout: `GET /public/orders/:id/receipt`                  |   42,696 | 2,135 |    4.4 |    6.8 |   13.3 |    0.00% | 200              |

Booking create against a service with open slots, 10 s each:

| Service (fresh)  | Concurrency | Requests | p50 ms | p95 ms | p99 ms | 5xx | Answers             |
| ---------------- | ----------: | -------: | -----: | -----: | -----: | --: | ------------------- |
| 1:1 sessions     |          10 |    7,610 |   12.3 |   20.2 |   30.0 |   0 | 130 × 201, rest 409 |
| 1:1 sessions     |          20 |    7,519 |   26.1 |   31.1 |   42.9 |   0 | 20 × 201, rest 409  |
| Private sessions |          20 |    6,686 |   29.4 |   35.4 |   46.1 |   0 | 15 × 201, rest 409  |

One visitor, 5 concurrent, 5 s: the limits hold. Enquiry: 5 accepted, then 429. Booking: 4 attempts, then 429. Receipt: 239, then 429 (the new PAY-08
limit). No 5xx.

## What it found

- **Before the fix, 56 of 8,165 concurrent bookings answered 500.** Through the
  pg driver adapter, a lost serializable race could surface as a
  `DriverAdapterError` (`TransactionWriteConflict`) with no `P2034` code, so
  the "fully booked" mapping missed it. It's fixed for every serializable path
  (`common/prisma-errors.ts`). After the fix: 0 errors at 10- and 20-way
  concurrency.
- Latency is flat. The slowest path, booking create at 20 concurrent, stays
  under 50 ms p99. Its serializable transaction is the cost, and it grows with
  contention on one slot, which is the case that matters.

## Limits of this run

- **Checkout start (`POST /public/orders/:id/payment-intent`) is not load
  tested.** Creating an intent calls Razorpay or Cashfree with the merchant's
  credentials, and the seed's are placeholders. A load smoke must not call a
  payment provider. What's measured is the receipt read the checkout page
  polls. The intent route's own throttling is unit-tested
  (`public-payments.controller.spec.ts`).
- Local only: no Cloudflare, no TLS, no network hop, and no production-sized
  data. Re-run against a restored copy of production data (see
  `runbooks/RESTORE_DRILL.md`) before a launch.
- The RLS-enforced mode wasn't load-tested. Each org-scoped query then becomes
  a short transaction. These public paths run with no org context, so it
  doesn't touch them, but the merchant's screens should be measured before
  enforcement goes on in production (`RLS_ROLLOUT_AND_OPS.md` step 5).
