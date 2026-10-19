# Background jobs

> **Read when:** enqueueing a background job, writing or registering a handler,
> or changing `apps/api.saroh.in/src/modules/jobs`.
> Adapted from claude-patterns `backend/05-jobs-and-locks.md`. Architecture:
> DEC-008.

## The model — **Current**

- **Transactional outbox.** A producer writes a `Job` row with
  `tx.job.create(...)` inside the same transaction as the business change, so a
  committed booking or enquiry always has its job.
- **Poll worker.** `JobWorkerService` claims due jobs with
  `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`, runs the handler,
  then completes or fails the job. Defaults: `JOB_WORKER_POLL_MS=2000`,
  `JOB_WORKER_BATCH=10`, `JOB_VISIBILITY_MS=300000`.
- **At-least-once.** Retries back off exponentially (1 s base, 5 min cap) up to
  `maxAttempts` (5), and the job is then FAILED. Staff may cancel a job that
  is still `PENDING` (`CANCELLED`, below).

## Rules

- **Current** — **Every enqueued type has a handler, registered in the same
  change.** Export the type as a constant beside its handler
  (`ENQUIRY_NOTIFY_TYPE`) and register it in the module's `onModuleInit` through
  `JobHandlerRegistry`. `modules/jobs/job-consumers.spec.ts` fails when a
  produced type has no handler or a handler has no producer, except for the
  known gaps below.
- **Current** — **A job with no handler is dead-lettered, never "done".** The
  worker marks it FAILED at once, attempts untouched, the reason in `lastError`,
  with an ERROR log. It used to complete as a no-op, which is how every
  `booking.notify` was recorded as delivered while nothing was sent.
- **Current** — **Handlers are idempotent.** Guard the effect with a unique
  constraint (a `Notification` unique on `(leadId, type)`), write absolute values
  (analytics rollups), or keep a ledger (`AutomationRun`, once per rule and
  lead). Write the durable record before the best-effort side effect.
- **Current** — **Terminal writes are fenced on the lease.** `complete`, `fail`
  and `deadLetter` update
  `WHERE id = … AND status = 'PROCESSING' AND lockedBy = <worker>` and report
  whether they won; a new write to a claimed `Job` carries the same condition.
  Reclaim is anchored on `lockedAt` (the claim), never `createdAt`.
- **Current** (10 Oct 2026) — **Every inbox notice names what it opens.**
  A `Notification` is written with `noticeOf(type, target)`
  (`notifications/notice-target.ts`), which makes the target required for
  the type: an order's notice sets `orderId`, a booking's `bookingId`, a
  failed payment's `invoiceId`, the website's `siteId`, and a notice about
  a place (the team, the plan, the providers) sets none. `tellTeam` writes
  what a worded alert carries through `noticeHeadOf`, which throws for a
  type that isn't listed or a record that is missing, so the job fails
  loudly instead of writing a row that opens nothing. A new notice type
  adds its line to `NOTICE_KINDS`, and the app's `lib/notifications/href.ts`
  its address when the kind is new. `notice-target.spec.ts` reads the
  source and fails a `notification.create` that goes round it.
- **Current** — **A job that does two independent things is two jobs.** An
  enquiry enqueues `enquiry.notify` and `automation.run` separately.
- **Adopted** — **Never enqueue a job the handler will no-op on.** A
  pay-now hold is not told until it is paid, and a course's sessions are
  not told one by one. Gap: an order step (`customer.notify`) and a booking
  are queued whether or not the customer can be reached; the handler
  decides (`site-accounts/notice-reach.ts`).
- **Current** — **Recurring work is a self-rescheduling job** — there is no
  scheduler (`subscription.renew`, ADR-007). Each run ends by enqueueing the
  next; a partial unique index allows one PENDING run of the type, and
  `schedule()` inserts expecting to lose — P2002 means "already scheduled".
  The handler logs and continues past a failing item (it must not dead-letter
  the chain), but throws when it cannot enqueue the next run so the worker
  retries it. A timer (`ensureScheduled`) restarts a chain found with nothing
  PENDING or PROCESSING, and boot does the same. A run works through batches
  and never re-fetches an id it has tried, so a batch that always fails cannot
  starve the rest. Compare `runAt` in UTC: the columns are
  timestamp-without-timezone (`DEV_LEARNINGS.md`).
  `account-managers.link-sweep` (U25) keeps its one waiting run with an
  advisory lock around the count and the insert
  (`job-chain:account-managers.link-sweep`) instead of the partial unique
  index, so it needed no migration; the index stays the default for a new
  chain.
- **Current** — **Payloads carry ids, not data;** the handler re-reads current
  state and handles "it was deleted" (`enquiry-notify.handler.ts`).
- **Current** — **Advisory locks have a registry** (below). A new
  `pg_advisory_xact_lock` adds its row in the same change.
- **Current** (18 Oct 2026) — **A job written inside a business's transaction
  carries that business's `organizationId`,** even when its work spans
  businesses: the `Job` RLS policy refuses one with none there.
  `billing.profile.sync` reads it from the transaction
  (`scopedOrganizationId`, `billing/billing-profile-sync.ts`), and queues with
  none only outside one.
- **Current** (DEC-122) — **A job that deletes asks about the legal hold.**
  A business on legal hold (`organizations/legal-hold.ts`) keeps every row
  and file. A sweep reads the held ids once a run (`heldOrganizationIds`)
  and leaves them out of the read and of the delete; a job that erases one
  business checks under the business's row lock (`onLegalHoldLocked`,
  `inEraseTx`). `organizations/legal-hold.deletes.spec.ts` scans for jobs
  that delete and fails a new one until it is listed as hold-aware or as
  deleting nothing of a business's, with why.

### Advisory lock registry — **Current**

Each is a transaction lock on `hashtext(<key>)`, held until the
transaction ends. Take it before the transaction's row locks, so it never
waits while holding one.

| Key                                       | Serialises                                                                                                                                                                                                                                                                                                                               | Where                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-export:<organizationId>`            | Asking for a business's data download: one QUEUED or RUNNING at a time (DEC-120), with the partial unique index behind it                                                                                                                                                                                                                | `data-export/data-export.service.ts` (`request`)                                                                                                |
| `first-pack:<organizationId>:<contactId>` | Selling a "first pack only" pack to one person                                                                                                                                                                                                                                                                                           | `class-packs/first-pack.ts`                                                                                                                     |
| `subscription-plan-name:<organizationId>` | Saving a subscription plan's name in one business                                                                                                                                                                                                                                                                                        | `subscriptions/plans.ts` (`lockPlanNames`)                                                                                                      |
| `domain-alert:<domainId>`                 | Telling one custom domain's down or back (#917), so a "Check now" and a run that both saw the change tell it once                                                                                                                                                                                                                        | `notifications/domain-alerts.ts` (`wordDomain`)                                                                                                 |
| `provider-alert:<providerId>`             | Telling the team one payment or email connection stopped or works again (#555)                                                                                                                                                                                                                                                           | `notifications/provider-alerts.ts` (`wordProvider`)                                                                                             |
| `billing-profile:<billingProfileId>`      | Making (or adopting) a billing profile's one customer at Saroh's billing provider (DEC-167), so the profile's job and a checkout make one. Held across up to three provider calls: `SET LOCAL lock_timeout = '30s'` first, and each id answered is stored at once on its own connection, so a transaction that ends badly never loses it | `billing/billing-customer.ts` (`create`)                                                                                                        |
| `admin-sign-in-code:<userId>`             | Staff sending one person a sign-in code (admin console U9): the per-person and per-staff hourly counts and the send's ledger row, so two staff pressing at once can't both pass the limit                                                                                                                                                | `admin/admin-sign-in-help.service.ts` (`sendCode`)                                                                                              |
| `account-manager:<organizationId>`        | Staff changing who looks after one business (DEC-169, admin console U25): assign, move, end, and each business a share-out gives, so two at once can't both start a link                                                                                                                                                                 | `admin/admin-account-managers.service.ts` (`lockBusiness`)                                                                                      |
| `account-managers:share-out`              | One Share out evenly at a time, so two can't plan from the same loads; taken before the per-business keys                                                                                                                                                                                                                                | `admin/admin-account-managers.service.ts` (`shareOut`)                                                                                          |
| `job-chain:account-managers.link-sweep`   | Leaving one waiting run of the manager link sweep: "is one waiting? if not, add one" under the lock, in place of a `Job_one_pending_…` index                                                                                                                                                                                             | `admin/manager-link-sweep.job.ts` (`schedule`)                                                                                                  |
| `commission-invoice:<sarohInvoiceId>`     | Writing and moving one payment's commission lines (DEC-169, admin console U21): the line job, the refund job, the sweep and a rate set all settle through it                                                                                                                                                                             | `commission/commission-settle.ts` (`settleInvoiceInTx`)                                                                                         |
| `commission-payout:<platformAdminId>`     | Putting a line in a teammate's statement month against Mark paid locking that month, so a line never lands in a month already paid; taken after the invoice's key                                                                                                                                                                        | `commission/commission-settle.ts`; `admin/admin-commission.service.ts` (`markPaid`)                                                             |
| `job-chain:commission.sweep`              | Leaving one waiting run of the commission sweep, as the manager link sweep does                                                                                                                                                                                                                                                          | `commission/commission-sweep.job.ts` (`schedule`)                                                                                               |
| `plan-meter:<organizationId>:<limitKey>`  | Writes that add to one plan limit (a product, a booking…); a booking notice Saroh will email takes `…:sarohEmailsPerMonth` before its first write (DEC-086)                                                                                                                                                                              | `billing/metering.service.ts` (`lockMeter`, U13); `customer-notify.handler.ts` (the one notice site; `booking.notify` writes nothing before it) |

Race tests wait on an advisory lock with `waitUntilAdvisoryBlockedBy`
(`test/lock-wait.ts`).

Two row locks do the same work without an advisory key (DEC-122), both on
the business's own `Organization` row, `FOR SHARE`, held to the end of the
transaction:

| Lock                            | Serialises                                                                                                                                                | Where                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Organization` row, `FOR SHARE` | A destructive write against placing a legal hold (which updates that row): the hold waits for the write under way, and every write after it sees the hold | `organizations/legal-hold.ts` (`onLegalHoldLocked`: the clean-up's keys, a privacy removal's last transaction)        |
| `Organization` row, `FOR SHARE` | The same, for every write of the retention eraser, which also checks the business is still `DELETED_RETAINED`                                             | `admin/retention-erase-writes.ts` (`inEraseTx`); a contact is then locked `FOR UPDATE`, as a privacy removal locks it |

### Know what the warnings mean — **Current**

- `… after its lease was reclaimed; outcome not recorded` (WARN): occasional is
  fine; a steady stream means some handler outlives `JOB_VISIBILITY_MS`.
- `No handler registered for job type …; dead-lettered` (ERROR): a producer
  shipped without its consumer.

### Testing — **Current**

`FakeJobQueue` mirrors the claim, the backoff and the lease fence. Drive the
worker with `runOnce()`; the poll loop does not start under `NODE_ENV=test`.

## Known gaps

None. A new one is listed here and in `job-consumers.spec.ts`; close a gap
and delete its entry in the same commit.

`analytics.aggregate` was one: its handler was registered (S7-002) and
nothing queued it, so rollups came only from the seed. DEC-075 closed it
with the hourly `analytics.rollup` chain (below).

`booking.notify` was the other gap: enqueued on every booking and
reschedule from S4-002 with no handler, so its jobs dead-lettered and
nobody was told. Round-2 A14 closed it (`bookings/booking-notify.handler.ts`).

## Cancelling a job — **Current** (#907)

- **Staff cancel only a job that hasn't started or is waiting to retry**
  (`PENDING`), from the console's Jobs screen, as a `jobs.cancel` durable
  operation: dry run first, a reason, `jobs:retry` (the people who retry
  jobs cancel them), audited as `operation.jobs.cancel.started`
  (`admin/job-cancel.ts`). The write is fenced on `PENDING`, so a worker
  that claims the job first wins and the cancel says so. A cancelled job is
  `CANCELLED`, terminal like `DONE`; nothing claims it again.
- **Refused on purpose** (`CANCEL_REFUSED`): the self-rescheduling sweeps
  (`ensureScheduled` would start the chain again; `organization.retention.erase`
  and `security-logs.retention` among them), `subscription.charge`
  (its steps hand on to each other) and `site.go_live` (the release keeps
  its schedule; the business cancels it from its Website). A new chain or a
  job whose state lives elsewhere adds its type there.
- **A durable operation can be cancelled while it runs**
  (`POST /admin/operations/:id/cancel`, `admin/admin-operation-cancel.ts`):
  rows not started are `SKIPPED` ("Cancelled before it ran"), the one
  running finishes, and the operation is `CANCELLED`. It needs the
  permission the operation was started under, checked in the service, and
  is audited as `operation.<kind>.cancelled`.

## Business deletion — **Current** (#907)

- **`organization.deletion`** is a daily self-rescheduling sweep
  (`admin/organization-deletion.handler.ts`), one PENDING run at a time
  (`Job_one_pending_organization_deletion`). It takes a business whose
  `PENDING_DELETION` window has ended (`deletionScheduledAt` passed) to
  `DELETED_RETAINED`, stamping `deletedRetainedAt` — the lifecycle's own
  last step (`admin-access.service.ts`) — and queues its clean-up on the
  same transaction. **Never a business on legal hold** (DEC-122): it isn't
  listed, the write is fenced on `legalHoldAt`, and it stays
  `PENDING_DELETION` until a Platform Owner lifts the hold. **Not while its customers are owed a refund** (owner,
  9 Oct): `payments/refunds-outstanding.ts`, read inside that transaction,
  finds every refund owed, refused, being sent or unconfirmed by its
  provider (Home's and Order Detail's own definitions, and queued
  `payments.send-refund` jobs); with any, the business stays
  `PENDING_DELETION` past its window, the ledger gets one
  `organization.deletion.waiting_on_refunds` row a day, the console flags
  it "Deletion waiting on refunds" (`admin/deletion-trail.ts`) and the
  workspace banner lists them (`GET /organizations/:id/closing`). Each run
  asks again. Its rows are never deleted (`Store`, `Order`,
  `Customer`, `Cart` and `Inventory` hold the business without a cascade;
  orders, invoices, credit notes, customers and the audit trails are
  records, ADR-008).
- **`organization.deletion.cleanup`** (#921, one per business,
  `admin/organization-deletion-cleanup.handler.ts`) shuts a deleted
  business's access off, and **keeps its data and its files** (DEC-122:
  until then it deleted the files on day one). Each step is idempotent and
  tried whatever the others did: its pending jobs cancelled (but the clean-up itself,
  `billing.provider.cancel`, `subscription.charge`, which stands aside on
  its own, and `payments.send-refund` — a customer's money is never called
  off), Saroh's subscription cancelled at the provider and then recorded
  CANCELLED (provider first: no answer writes nothing), custom hostnames
  deleted at Cloudflare and the claims released, the customers' active
  autopay mandates read and
  logged per provider (deletion cancels none there), then the payment and
  messaging keys deleted (`CommunicationProvider` too) at once — they are
  secrets, not records — never while a
  refund is still owed, which fails the step so it is retried. **On legal
  hold it removes nothing**: a run that finds the business held stands
  aside whole, notes it on the ledger and ends without failing (so it is
  neither retried nor flagged), a hold placed mid-run stops every
  destructive step after it (`CLEANUP_DESTRUCTIVE_STEPS`, the keys under
  the business's row lock), and lifting the hold queues the clean-up
  again. Every
  provider call logs one `deletion_provider_call` line
  (`devops-observability.md`), and each run writes an
  `organization.deletion.cleanup` ledger row with every step's result: the
  console's deletion trail. A failing step is
  logged by name and the run throws, so the queue retries it (24 attempts,
  about an hour and a half); from its first failure the business is flagged
  "Deletion clean-up unfinished" (`DELETION_CLEANUP`) in the console's
  directory, and once FAILED an operator retries it from Jobs. It can't be
  cancelled (`CANCEL_REFUSED`). The daily sweep queues one for any deleted
  business without one.
- **Re-read inside the transaction, fenced on `lifecycleVersion`**: a
  business reinstated, suspended or given a new window between the list
  and the write is left alone, and one inside its window is never touched
  (`organization-deletion.db.spec.ts`). Each deletion writes the admin
  ledger (`system:organization-deletion`, `organization.deleted`) and the
  business's own history in that transaction; the log line carries counts
  and ids only.

## Retention — **Current** (DEC-122)

How long things are kept is one file, `organizations/retention.ts`
(`RETENTION_AFTER_DELETION_DAYS` 180, `SECURITY_LOG_RETENTION_DAYS` 365);
the Privacy Policy states both.

- **`organization.retention.erase`** is a daily self-rescheduling job
  (`admin/organization-retention-erase.handler.ts`), one PENDING run at a
  time (`Job_one_pending_organization_retention_erase`), restarted by the
  admin module's six-hour check and at boot. It erases a business that has
  been `DELETED_RETAINED` for 180 days (`deletedRetainedAt`; the
  `RETENTION_AFTER_DELETION_DAYS` variable can lengthen that, never shorten
  it) and isn't erased yet (`retentionErasedAt`), in the steps of
  `admin/retention-erase-plan.ts`: its files (`MediaService
.removeAllForDeletedBusiness`), class waitlists, every contact by the
  privacy removal's own writes (`removeDetailsInTx`, each in its own
  transaction), the store customers no contact reached, a business-wide
  pass (orders' recipients and walk-ins, bookers, messages, reviews, the
  CRM, the team's notices, invitations and diary names) and the detailed
  analytics events. Then it stamps `retentionErasedAt` with the admin
  ledger and the business's history in one transaction. **Never invoices,
  credit notes or an order's tax facts** (ADR-008); `RETENTION_KEPT` lists
  what stays. A new field a privacy removal keeps (`personal-data.ts`) or a
  relation it keeps (`REMOVAL_RULES`) needs a decision in
  `KEPT_FIELD_DECISIONS` / `KEPT_RELATION_DECISIONS`:
  `retention-erase-plan.spec.ts` fails without one.
- **Refused under legal hold, and while a refund is owed.** A held business
  is never listed and is checked again before it starts; every write runs
  in `inEraseTx`, under the business's row lock, and the files ask before
  every batch, so a hold placed mid-run stops it within one small
  transaction. A business that still owes a customer a refund waits, as
  the clean-up's keys do.
- **Resumable.** A failing step is logged by name, the business isn't
  stamped, and the next run starts again; what is already gone isn't
  found. At most 1,000 contacts a business a run, then back in a minute
  rather than a day. Each unfinished run is one
  `organization.retention.erase` ledger row a day per outcome; the
  finished one names every step and count. It keeps its lease
  (`keepJobLease`) and can't be cancelled (`CANCEL_REFUSED`). Counts and
  ids only in the log.
- **`security-logs.retention`** is the daily self-rescheduling sweep
  (`admin/security-log-retention.handler.ts`), one PENDING run at a time
  (`Job_one_pending_security_logs_retention`). It deletes `Session` and
  `CustomerSession` rows a year after they ended (`expiresAt`; a live
  session is never touched), and `CustomerSignInCode`, `AuditLog` and
  `SecretAccessLog` rows a year after they were made: 1,000 ids a
  statement, at most 20 batches a table a run, back in a minute when a
  table stops at its cap. Nothing pruned these before. **Never
  `AuditEvent`, `AdminAuditEvent` or `AdminAccessSession`**: the audit
  trails are records. A business on legal hold keeps its rows, and its
  members their sign-in sessions. It logs counts per table.
- **`analytics.retention`** (below) leaves a held business's events too.
- **`waitlist.retention`** (`waitlist/waitlist-retention.handler.ts`) is
  the one daily chain for what saroh.in's visitors leave with Saroh: a
  waitlist entry 12 months after its invite, a link-preview report and a QR
  code maker email 12 months after last use, and a message from
  saroh.in/contact 12 months after it arrived (DEC-137,
  `contact-messages/contact-retention.ts`). A new kind of visitor data
  joins this sweep as a function it calls, counted and caught on its own,
  rather than starting a chain (and a partial unique index) of its own.

## Account manager links — **Current** (DEC-169, admin console U25)

- **`account-managers.link-sweep`** (`admin/manager-link-sweep.job.ts`) is
  an hourly self-rescheduling job, restarted by the admin module's six-hour
  check and at boot. It ends every open `AccountManagerLink` whose manager
  doesn't hold the Account manager role now (an assignment that ran out, or
  a revoke or amend that bypassed `AdminStaffService`, which ends them
  itself), at the moment the role ended (`roleEnded`), with one ledger row
  per business as `system:manager-link-sweep`. At most 200 managers a run;
  a manager whose links fail to end is logged and the rest go on.

## Commission — **Current** (DEC-169, admin console U21)

- **`commission.line`** writes one payment's commission lines; queued by
  the billing webhook **after** its transaction commits
  (`CommissionQueue`, a failure only logged), only for an invoice whose
  business had a manager when it was issued. **`commission.refund`**
  re-settles a refunded or disputed payment's lines, only when its invoice
  has some. Both are idempotent (one line per invoice and installment,
  every move conditional on the status it leaves), retried 8 times; the
  last try raises `commission_line_failed` in Needs action, once per
  invoice, and ends.
- **`commission.sweep`** is hourly and self-rescheduling (one waiting run
  under `job-chain:commission.sweep`, restarted by the module's six-hour
  check and at boot): payments of the last 60 days with no line whose
  manager was on commission, open lines whose period ended or that are
  HELD, NO_RATE or PAYABLE, and payments whose refund or dispute changed
  in the last 3 days. Pages of 200 by id, never re-reading one it tried;
  an invoice that fails is logged and the rest go on.

## Data export — **Current** (DEC-120)

- **`data-export.build`** (one per ask, `data-export/data-export.handler.ts`)
  builds a business's zip: each table's CSV read 500 rows at a time by id
  (`data-export-tables.ts`), each media file streamed from storage, all
  written to a temp file as it goes (`zip-file.ts`) and uploaded from it
  through `ObjectStorage.putObject`; the file is removed whatever happens.
  It marks the `DataExport` READY with its 7-day end, queues
  `data-export.expire` for that moment on the same transaction, and emails
  the owner a signed link (best-effort; the workspace shows it either way).
  Three tries; the last failure marks the export FAILED in words.
  Idempotent: an export no longer being made is left alone, and a retry
  writes the same key.
- **A handler that can outlive `JOB_VISIBILITY_MS` keeps its lease**:
  `keepJobLease(job)` (`jobs/job-lease.ts`) moves `lockedAt` on every
  minute, fenced on the lease, until the returned stop is called. The
  export is the first; the worker still runs one job at a time, so a long
  one delays the rest on that worker.
- **`data-export.expire`** deletes the zip from storage, then marks the
  export EXPIRED (storage first: a failed delete is retried with the key
  still on the row). The deletion clean-up never cancels it
  (`CLEANUP_KEEPS_JOB_TYPES`), so a deleted business's zip still goes.
- **On legal hold no export is made** (DEC-122): asking and linking are
  refused in the service, and a build queued before the hold marks its
  export FAILED with the hold's sentence. `data-export.expire` still runs
  for a held business: the zip is a copy, and the records stay.

## Insights rollups — **Current** (DEC-075)

- **`analytics.rollup`** is a self-rescheduling chain, hourly
  (`analytics/analytics-rollup.handler.ts`), one PENDING run at a time
  (`Job_one_pending_analytics_rollup`). Each run finds every business and
  UTC day with an `AnalyticsEvent` _received_ since its payload's `since`
  (indexed on `receivedAt`) and queues one `analytics.aggregate` per pair;
  the aggregate rebuilds that day with absolute upserts, so a duplicate is
  harmless. The next run looks back five minutes past where this one
  stopped, for an insert that committed late; a run whose sweep failed
  hands its own `since` on. A fresh chain (boot, or `ensureScheduled` every
  six hours finding none) starts 90 days back, the page's longest range.
- **`analytics.retention`** is the daily self-rescheduling sweep (#799,
  `analytics/analytics-retention.handler.ts`), one PENDING run at a time
  (`Job_one_pending_analytics_retention`), restarted by the same six-hour
  check and boot. It deletes `AnalyticsEvent` rows whose `expiresAt` (intake
  stamps received + `ANALYTICS_RETENTION_DAYS`, 400) has passed, 1,000 ids a
  statement in `expiresAt` order, at most 50 batches a run; a run that stops
  at that cap with more due comes back in a minute, not a day. A row with
  no stamp is kept. It **never deletes an aggregate**: the daily rollups
  outlive their events, and `analytics.aggregate` refuses to rebuild a day
  that starts before the 400-day cutoff (`pastRetention`), since what is
  left of it would shrink its rollup. It logs counts only. A business
  on legal hold keeps its events until the hold is lifted (DEC-122).

## Custom-domain re-check — **Current** (#860)

- **`domains.recheck`** is a self-rescheduling chain, every five minutes
  (`domains/domain-recheck.handler.ts`), one PENDING run at a time
  (`Job_one_pending_domains_recheck`). Each run checks the domains due by
  the ladder in `domains/domain-recheck.ts` through
  `DomainsService.check`, the same check as "Check now": a verified
  domain not live yet every 5 minutes for its first hour, hourly to a day,
  then every 6 hours; a live one daily, so one that stops pointing here is
  noticed; an unverified claim on the same ladder for its TXT record,
  never past 7 days. "Check now" stamps the same columns, so it resets the
  turn.
- **Kind to Cloudflare.** At most 50 domains a run, oldest-checked first,
  one or two calls each; three host failures in a row (a 429, an outage)
  end the run and the rest wait for the next. A failure is written on the
  row as "Check now" writes it and never undoes the verification.
- **Off where hosting is off.** No Cloudflare token or zone (dev, local),
  or the test-only domain fakes on: the chain is never started, a stray
  run logs `domains_recheck_off` and ends, and domains move only on
  "Check now".
- **A `www` domain's bare domain is looked at in the same check**
  (DEC-140, `domains/bare-domain-sync.ts`): whether `example.com` forwards
  to `www.example.com`, over https too, or points straight here. It is
  written on the row (`bareStatus`) as a notice. It is never a host
  failure, never counts toward the back-off, and never tells the team:
  the `www` site is not affected by it. A look waits on a stranger's
  host (three seconds at most for each of `http://` and `https://`), so
  the background's looks share 60 seconds in any five minutes
  (`BareLookBudget`): past that they are skipped, the row keeps its last
  standing, and the run stays inside its job lease. "Check now" always
  looks.
- **A live domain that goes down tells the team, once per incident**
  (#917, `notifications/domain-alerts.ts`). The check's write that moves a
  domain out of live (ACTIVE), or back into it, queues `team.alert`
  `{ event: "domain", change: "down" | "back" }` on its own transaction
  (`syncHosting`'s `onLiveChange`), whether the run or "Check now" ran it;
  the one who pressed Check now isn't emailed. Told on the Your website
  row (`domain.down`, `domain.back`): the bell names the domain and what
  is wrong, Saroh's email names the site and links to its settings (a
  domain is what `cleanName` takes out). Claimed as
  `team:domain:<id>:<down|back>:<at>`; the last claim decides what may be
  told next, under the `domain-alert` lock, so "down" is told only after
  no "down" or a "back", and "back" only after a "down": nothing while a
  problem lasts, nothing when a domain first goes live. The run still
  logs `domain_hosting_went_down` at WARN.
- A domain removed while a run checks it: the run deletes the hostname at
  the host when no row holds it any more, so a re-registration it raced
  isn't left serving.

## Customer notices — **Current** (A14)

- **`booking.notify`** (booked, moved, cancelled, a hold paid) tells the
  team when the customer moved or cancelled it themselves (a
  `Notification`), and delegates the customer's side to
  `CustomerNotifyService`. **`customer.notify`** carries an order step
  (Ready, handed over), queued 10 seconds ahead so an Undo deletes it
  unsent (`cancelOrderStepNotice`); A12 adds the waitlist offer. UX-042
  adds **a website order placed** (`ORDER_PLACED`, `order-placed:<orderId>`):
  queued with the order when it is to be paid on handover, and with the
  payment's hold when it is paid online (`enqueueOrderPlacedNotice`). It
  goes through the same `emailRoute` as every notice, so Saroh never sends
  it (DEC-086 is booking notices only): the thread, and the business's own
  provider.
- **`customer-message.notify`** (UX-014) tells the team a customer wrote
  from their site account: one inbox notice (`message.new`, opening the
  customer's thread, unique on `(messageId, type)`) and an email to the
  owners and admins, as an enquiry's. Only the first message of a turn is
  queued — one after the team last answered or opened the thread
  (`notifications/customer-message-notify.ts`); follow-ups land in the
  thread the team is already pointed at.
- **Once per event.** Both claim a `CustomerNotice` row keyed to the event
  (`booking:<BookingEvent id>`, `order:<OrderEvent id>`) with
  `createMany({ skipDuplicates })` before writing anything: a Postgres
  transaction cannot carry on after a caught P2002, so never insert-and-catch
  inside one.
- **A bulk move queues each order's notice as a single move does** (B6).
  `orders.stage-batch.commit` commits a held batch ten seconds after it
  is written; each line goes through `order-stage-write.ts`, so every
  moved order gets its own `customer.notify`, and Undo all takes each one
  back or reports `told`.
- **Re-read, then decide.** A booking cancelled since isn't confirmed, an
  undone step isn't announced, and the contact goes through
  `resolveContact` (a merge lands on the survivor; a removed contact hears
  nothing).
- **Saroh emails a booking notice when the business has no provider**
  (DEC-086), when the one rule says so (`emailRoute` in
  `communications/saroh-may-send.ts`, the provider read once:
  the global stop, the business's `SAROH_BUSINESS_EMAIL`, `PLAN_ENFORCEMENT`,
  a `saroh-emails` allowance with a number, the platform's daily ceiling).
  The handler decides first, takes the plan-meter lock only for Saroh's
  route, and hands the route (with the allowance row it read) to
  `queueTransactional`, so nothing it refuses rolls the notice back and
  nothing is read twice; the delivery is stamped `SAROH` and
  `message.send` re-checks the switches (off: `STOPPED`, never retried).
  Each one counts against `sarohEmailsPerMonth` under the plan-meter lock;
  at the cap the Message is `ALLOWANCE_USED`, never thrown. A soft
  `saroh-emails` cell is no allowance (`NO_ALLOWANCE`): it would never
  refuse. At most `SAROH_EMAILS_PER_BOOKING_PER_DAY` (3) go about one
  booking in any 24 hours, counted through its `CustomerNotice` rows;
  past it the Message is `BOOKING_LIMIT` and not counted. A flag that
  can't be read when the send job runs throws (retried, still `QUEUED`);
  only a switch read as off stops it. A last attempt that leaves it
  `QUEUED` logs `saroh_business_email_gave_up org=…` at WARN (it still
  counts).

## Autopay charges — **Current** (D13)

- **`subscription.charge`** runs a renewal's autopay charge in steps, each
  its own run (`subscriptions/charge-job.ts`): `PREPARE` (the order and its
  pre-debit notice), `DEBIT` (at `debitAfter`, asked again hourly while the
  notice is out), `LOOK` (the debit looked up when its webhook is late).
  The renewal writes the first step with the charge's intent on its own
  transaction; each step writes the next with `enqueueChargeStepInTx`,
  which skips a step already waiting for that charge, so a redelivered run
  never forks the chain. The debit is claimed on the intent before it is
  asked, so a run delivered twice debits once. A redelivery that finds the
  debit already claimed (`ALREADY`, PROCESSING) writes the `LOOK` step: the
  run before it may have died between the claim and its next step.
- **A charge that stands aside comes back on its own** (review 3). When a
  step refuses for a pay-link checkout the customer has open
  (CHECKOUT_OPEN), `stoodAside` writes, on the same transaction as its
  RENEWAL_FAILED, a `PREPARE` with `resume: true` and the next charge key,
  due when the checkout stops counting as open (`checkoutOpenUntil`). Its
  run finds no intent under that key and queues the charge again through
  `queueInTx` under the subscription's row lock (Retry's lock), unless a
  charge is already under way or a new checkout opened (then it writes
  itself again for that one's end).

## Team alerts — **Current** (F14)

- **`team.alert`** tells the business's own team, as each person chose in
  Settings › Your profile (`notifications/alert-preferences.ts`). A
  producer calls `enqueueTeamAlert(tx, …)` on its own transaction
  (`notifications/team-alerts.ts`): a new order (the create, and an online
  checkout's payment), an invoice's pay link failing (the webhook), an
  invitation accepted, a live custom domain going down or coming back
  (the domain's check, #917, above). `booking.notify` writes its team notice itself (A14)
  and queues `team.alert` with that notice's id for the email only.
- **One notice, filtered per person.** The bell is one org-wide
  `Notification`; `NotificationsService` leaves out, per viewer, the types
  of rows they turned the bell off for or can't read. Email goes from
  **Saroh** (`sendTeamAlertEmail`, `common/email.ts`), provider or not —
  Saroh telling a business about its own business (DEC-011, amended
  2026-10-07) — to each member whose role reads it and who has email on.
  `tellTeam` returns the emails and the handler sends them after the
  transaction commits (at most once). Saroh's email carries fixed words and
  the business's names cleaned (`cleanName`), never a customer's name or a
  run's free text; the bell keeps the full words.
- **Once per event**, claimed as a `CustomerNotice` (`TEAM_TOLD`,
  `team:<event>:<id>`), and re-read first: an unpaid checkout, a payment
  that went through after all, or someone who left again is not announced.
- **Two alerts widen who is emailed**, on the same path and the same
  helper (there is no second team-mail helper): a new website order
  (`ownersAdminsByDefault`) emails the owners and admins as an enquiry's
  notice does, unless they turned the New order email off (UX-042); a
  review asked of a site's reviewers, and a new test release
  (`emailReviewersOf`), email its reviewers, who have no bell (UX-043). A
  provider that refused its keys (UX-012) is emailed too, email providers
  included: Saroh sends it, not the refused key.
- **A provider that stops and starts again** (#555,
  `notifications/provider-alerts.ts`) is told once per incident: "down"
  when a live call's 401/403 flags the connection, "back" when keys entered
  again or a live call accepted on the flagged connection clear it. Each
  is claimed as `team:provider:<id>:<down|back>:<at>`, and the last one
  told decides what may follow ("down" only after none or "back", "back"
  only after "down"), under the `provider-alert:<id>` lock. A claim made
  before #555 (`team:provider:<id>:<at>`) reads as "down".
- **Review alerts** (`team.alert` `{ event: "review" }`,
  `notifications/review-alerts.ts`, UX-043), queued on the review write's
  transaction (`sites/review-alert-queue.ts`): a request or a new test
  release goes to the reviewers (only queued when the site has one); a
  verdict, or a reviewer's first note of a round
  (`team:review-note:<site>:<release|draft>:<author>:<request id>`), goes
  to the bell and the Website row (`site.review.*`), and the person who
  asked is emailed whatever they chose. A note by someone who can publish
  queues nothing.
- **Order alerts live on the New order row** (`event: "order"` in
  `alert-preferences.ts`, notice types `order.new` and `order.uncollected`).
  A new order type of alert adds its notice type there, so the bell switch
  and the role check cover it. An order someone on the team took (not
  placed online, with an `actorUserId`) writes no bell notice (#874): the
  bell is one notice for everyone, so it rang for the person who had just
  made the sale. Whoever chose email for New order is still emailed. **Not collected** (R34, DEC-032): a site
  order to pay on handover queues `team.alert` `{ event: "uncollected" }`
  with the order, `runAt` the start of the third day after it was placed in
  the business's zone (`queueUncollectedAlert`). The run re-reads it: paid,
  handed over or cancelled since says nothing; not due yet (the zone moved)
  queues itself again for its day (`putOffUntilDue`); else it is told once
  (`team:uncollected:<orderId>`). It never cancels the order. Home's row is
  read live (`home/home-uncollected.ts`), not from the alert. Known gap: a
  pay-on-handover order placed before this shipped has no alert queued;
  Home still shows it.

## Scheduled go-live — **Current** (DEC-071, T10)

- **`site.go_live`** puts a test release live at the time the merchant
  chose, in the business's zone (`businessTimezone`; a time the clocks
  skip is refused, not moved). Scheduling writes the release's schedule
  columns and the job, `runAt` = the instant, in one transaction
  (`sites/test-release-schedule.ts`). The payload is
  `{ testReleaseId, goLiveAt }`.
- **The release row is the lock.** Scheduling, cancelling and the run each
  take it `FOR UPDATE`. Cancel (and moving a schedule) deletes the job
  fenced on `status = 'PENDING'`; a PROCESSING job answers 409 "going
  live now". A partial unique index allows one live schedule per site.
- **Re-read, then decide** (`sites/go-live.handler.ts`). A run whose
  release was cancelled, moved (`goLiveAt` differs), went live or was
  discarded does nothing. Then it doesn't go live, and says why, when the
  site was published after it was scheduled (`scheduledOverPublicationId`,
  KTD-14), when the person who scheduled it left or can no longer publish,
  or when "Publishing needs approval" is on and the release isn't approved
  and no owner override was recorded. Otherwise it goes live through
  `goLiveWithRelease` (so `putLive`) as the person who scheduled it, passing
  the stored override (while they are still an owner), so it is recorded
  as OVERRIDDEN exactly as going live by hand with one is (T9).
- **A clear no-go never retries.** It records `NOT_LIVE` with the reason and
  clears the schedule, so the merchant can go live now or schedule again. A
  transient failure throws and the worker retries; the last attempt records
  `NOT_LIVE` before giving up, so a schedule never hangs as "scheduled".
- **Told either way** through `team.alert`, event `site`, claimed once per
  release and instant (`team:site:<releaseId>:<goLiveAt>`). The Website row
  is offered to whoever holds `site:publish`, bell and email on by default,
  and only while `SITE_TEST_RELEASES` is on. Whoever scheduled it is emailed
  whatever they chose.
- A queued job still runs with `SITE_TEST_RELEASES` off (KTD-16): it is a
  go-live the merchant was told would happen.

## Site page cache — **Current** (#863)

- **`site.pages.revalidate`** tells the merchant sites' Worker which kept
  pages to stop serving (`sites/page-cache.job.ts`). The payload names
  sites (`siteIds`), products (`productIds`) or stock rows
  (`stockLevelIds`), plus the business when the products may be gone (a
  delete); the handler resolves them, as they stand, into the tags the
  renderer keeps pages under (`site:<id>`, `site:<id>:products`,
  `site:<id>:product:<id>`) and POSTs them, signed with
  `SITE_RELAY_SECRET`. A 2xx or nothing to name ends it; anything else
  throws and is retried. Queued only while `SITE_PAGE_CACHE` is `on`.
- **Who queues it** (`sites/page-cache-revalidate.ts`): `putLive` (every
  publish, restore and go-live), a web-address change, a post published,
  unpublished or deleted, trackers saved or switched by Saroh, the business
  logo set or removed (it is the icon of a site with none of its own,
  DEC-124), how the business is reached (its phone, contact email, social
  links, the registered address, its choice or its map link, and a
  location's name, address, map link, hours or kind: the footer reads them live, DEC-128; cause
  `contact`, `enqueueBusinessSitesRevalidation`), the business's own domain
  pausing or coming back with its plan (every page then names another
  address as its own, DEC-139; cause `domain`), how the business's prices carry GST (its
  choice, its registration, its GSTIN or state: every price's GST words are
  read live; cause `prices`), and the catalogue. **Stock is heard at its locks:** every flow that changes a
  stock row or how a product counts takes `lockStockLevels`, `lockProduct`
  or `lockProducts` (`products/stock-levels.ts`, the lock order), and those
  queue on the same transaction, once per row or product per transaction.
  A new stock writer that keeps the lock order is covered; one that skips
  it isn't. `page-cache-triggers.spec.ts` pins the rest. A price or detail
  saved outside a transaction queues after its write.
- **A business with no live site still queues** on a stock change: knowing
  would cost a read in the hottest stock paths, so the handler finds no
  site and ends. The one place the "never enqueue a no-op" rule bends.
- **A write to a draft queues nothing.** A kept page is a published page,
  and a site's draft (its sections, its style, its footer) reaches one only
  through `putLive`. So bringing a site up to its template
  (`sites/template-sync.ts`: a module switched on, and the template upgrade,
  DEC-141) writes drafts and queues no revalidation. The upgrade is a
  command run by hand, not a job
  (`docs/architecture/runbooks/TEMPLATE_UPGRADE.md`): each site is one
  transaction and a site already upgraded is skipped, which is what makes it
  safe to run again.

## Plan limit notices — **Current** (plans catalogue U13)

- **`plan.limit.notice`** tells a business it has used 80% of a plan
  limit, reached it, or (the site's checkout, a soft cap) gone past it.
  A metered write queues it on its own transaction only when it crosses
  one of those lines (`MeteringService.roomInTx`, `crossesNotice`), so a
  write under 80% queues nothing. Payload: `{ organizationId, moduleId }`.
- **Re-read, then decide** (`billing/plan-limit-notice.handler.ts`): with
  `PLAN_ENFORCEMENT` off since, the row uncapped or off, or the count back
  under 80%, it says nothing. Otherwise it counts again and words the
  notice with `limitNotice` (`@saroh/pricing-catalog`).
- **Once per row, level, limit and window**, claimed as a `CustomerNotice`
  (`PLAN_LIMIT`, `plan-limit:<row>:<warn|full|over>:<limit>:<month|all>`)
  before the inbox row (`plan.limit`, owners and admins) is written; a
  monthly limit's window is the month in the business's zone, so next
  month warns again.
- **A total cap of one says nothing until it is passed** (`quietAtOne`,
  UX-041): the business's one website or owner is filled by setting it up.
  A monthly cap of one still warns.
- **A notice that no longer stands is cleared** when the inbox is read
  (`billing/limit-notice-clear.ts`): the count back under its line, a new
  month, a changed limit or an uncapped row deletes the notice and its
  claim, so crossing the line again tells again. It never throws.

## Plan change notices — **Current** (UX-041)

- **`plan.change.notice`** tells a business its plan changed when it
  didn't change it itself: staff set a plan until a date (told now, and
  again just past the date), or ended one early
  (`admin/admin-overrides.service.ts`). Payload `{ eventKey, fromPlanId,
overrideId, reason }`. Re-read, then decide
  (`billing/plan-change-notice.handler.ts`): still on `fromPlanId` says
  nothing; an override ended before its date says nothing at its date.
  Once per event (`PLAN_CHANGED`), inbox type `plan.changed`. Gap: a move
  the hourly sweep applies (`plan-moves.ts`) and the provider halting a
  subscription queue none yet; `pricing.move.notice` tells the first a week
  ahead.

## Pricing catalogue — **Current** (plans catalogue U4)

- **`pricing.site.revalidate`** tells saroh.in that the published pricing
  changed (KTD-10). A publish or roll back that is live at once queues it on
  its own transaction; a scheduled version queues it for its `goLiveAt`.
  Queued only when `PRICING_SITE_URL` and `PRICING_REVALIDATE_SECRET` are set; a failed
  call throws and retries, and never touches the publish. A version held for
  its billing-provider plans is refreshed by the sync (U15), not here.
- **`pricing.move.notice`** tells a business, seven days ahead, that "move
  them" moves its plan (KTD-4). One per moved subscription whose plan reads
  differently on the new version. Re-read, then decide: a move cancelled,
  replaced or applied says nothing; once per move, claimed as a
  `CustomerNotice` (`plan-move:<subscriptionId>:<pendingFrom>`). Cancelling
  the version, or a newer move, deletes the notices still PENDING.

## Saroh billing — **Current** (plans catalogue U15)

- **`billing.provider-plans.sync`** makes a published version's paid plans at
  Saroh's billing provider (RECOMMENDATIONS 5). Queued on the publish's own
  transaction, one waiting per version; while rows are PENDING it re-queues
  itself with a growing pause, so the queue's own retries aren't spent.
  Asking for a plan made under the row's id first keeps a repeat from making
  a second. The last row SYNCED puts a version past its go-live live and
  queues `pricing.site.revalidate` on the same transaction.
- **`billing.provider.cancel`** cancels a provider subscription (now, or at
  the cycle's end) after a plan change commits: the change never waits on the
  provider. A refusal is not settled (17 Oct 2026): the job asks where the
  subscription stands — ended (or in its last cycle, told to end with it) is
  done, authorised with no cycle running is cancelled now — and otherwise
  queues itself again with a growing pause (15 minutes to a day, its count
  in the payload), telling an operator after 8 tries and stopping after 14.
  A provider that can't answer (5xx, 429, the network) gets the queue's
  quick retries, then joins the same chain from the queue's last try,
  never dead-lettered. `withdrawProviderCancelsInTx` takes back the ones
  still waiting when a payment is honoured; one already running checks
  before it asks the provider and before it queues itself again, and
  stands down when the business is billed through that subscription again
  (live, not ending, the business not closing).
- **`billing.profile.sync`** (DEC-167) makes a billing profile's one
  customer at Saroh's billing provider, or sends its details as they are
  now: queued in the transaction that made or saved the profile (sign-up,
  a profile's edit, a checkout's details step) and by an operator's Sync
  again, at most one waiting per profile (`enqueueBillingProfileSync`).
  Skips with no provider keys (a warning in production); retried by the
  queue (10 tries); a refusal is logged, left as an admin note once, and
  dropped (`billing-customer.ts`). Profiles from before are queued by
  `backfill/billing-profiles.cli.ts`. DEC-165's **`billing.customer.sync`**
  stays registered for jobs already queued: it syncs the business's
  profile, and does nothing for a business without one.
- **`billing.payment.notes`** (17 Oct 2026) puts Saroh's invoice number,
  business and checkout on the provider's payment once Saroh's invoice
  has its payment id: queued on the invoice's transaction, retried by the
  queue (10 tries), a refusal or the last try logged
  (`billing_payment_notes_failed`) and left as an admin note
  (`payment-notes.job.ts`).
- **`billing.refund.double-charge`** (DEC-164) refunds a double charge in
  full through the provider: claimed once per payment by a platform audit
  row on the webhook's transaction, which queues it. A refusal (4xx) is
  never retried: an admin note asks the owner to refund it by hand, in
  the provider's words, with an ERROR log. No answer (5xx, network) is
  retried by the queue (20 attempts, about an hour, each failure logged at ERROR), the
  same note on the last. Once refunded it writes a second audit row,
  queues `billing.email` `DOUBLE_CHARGE_REFUNDED` and leaves an admin note
  that it was refunded (`double-charge-refund.job.ts`). The refund is kept
  as a `BillingRefund` (DEC-166), and an operator's "Check the refund
  again" queues the job anew with its claim's payload: after a hand
  refund the provider answers with that refund, so it completes without
  refunding twice.
- **`billing.reconcile`** (DEC-166) is the daily self-rescheduling sweep
  (`billing-reconcile.job.ts`, one PENDING run,
  `Job_one_pending_billing_reconcile`, restarted with the plan-move sweep's
  six-hourly check and at boot; `CANCEL_REFUSED`). It reads back what the
  provider took on every live provider subscription and every one ended or
  begun in the last 40 days (`reconcile.paidCharges`, at most 400 a run): an
  invoiced payment keeps the provider's amount and one that differs from
  the invoice's total is raised; a payment with no invoice and no
  double-charge claim is raised once (`dedupeKey`). It invoices nothing
  itself. A reference the provider can't answer is logged and skipped.
- **Every billing ops notice is also a Needs-action row** (DEC-166,
  `BillingAction`, `billing-actions.ts`), so a job that gives up on a
  money problem leaves something Admin › Billing lists across businesses,
  not only a note on one business. Admin › Jobs may retry a failed
  `billing.provider.cancel`, `billing.refund.double-charge` or
  `billing.payment.notes` of a suspended or closing business
  (`PROTECTIVE_JOB_TYPES` in `admin-operations.service.ts`): they stop or
  give back money and never act for it.
- **`billing.email`** (U17) is Saroh's own mail to a business: an
  invoice with its PDF (queued with the invoice), a failed charge (queued by
  the webhook on `pending` or `halted`), a first month or a free trial
  ending (U16 queues it, `enqueueBillingEmail`), a plan about to renew
  (#804: `RENEWAL`, queued by the hourly sweep 3 days before each autopay
  charge, below), a plan that ends (#805)
  and a 12-month term that ends (DEC-100: `TERM_ENDING`, queued by the
  hourly sweep with an inbox notice, claimed once per subscription, end and
  stage, and silent once a renewal is authorised). To everyone whose role has `billing:manage`, in
  one message. Re-read, then decide: an invoice already emailed
  (`emailedAt`), a failed charge paid since, a subscription no longer
  trialing say nothing; a notice is claimed as a `CustomerNotice`
  (`SAROH_BILLING_EMAIL`) once it has left. A send that fails throws and is
  retried; no recipient or no mail set up ends the job with a log line.
- **`billing.addons.sync`** (U16) puts a subscription's QUEUED add-on
  charges (`SubscriptionAddonCharge`) on its provider subscription's next
  charge, queued with the rows (a purchase, a renewal, a change of
  provider subscription). Each row goes under its own id as the reference
  and only a QUEUED row becomes SENT; a refusal is logged and the row
  waits for the next charge; anything unanswered is retried.
- **`billing.moves.apply`** is the hourly self-rescheduling sweep (one
  PENDING run, a partial unique index): due pending moves that are ready
  (`plan-moves.ts`) and OPEN checkouts past `expiresAt`. A paid
  subscription's move is applied by its renewal webhook first. Its last
  step is the renewal reminder (#804, `renewal-reminder.ts`,
  `renewal-reminder-notice.ts`): an ACTIVE paid autopay subscription whose
  period ends within 3 days is claimed once per subscription and period
  end (`CustomerNotice` `RENEWAL_REMINDER`,
  `renewal-reminder:<subscriptionId>:<periodEnd>`) and queues a `RENEWAL`
  email on the same transaction: the charge with GST (coupon and add-ons
  owed on it included), the date in the business's zone, and Plan and
  billing. Silent, in the sweep and again when the email runs
  (`renewalReminderOf`), for Free, TRIALING (the trial-ending email names
  that charge), PAST_DUE, a period that ends the plan
  (`cancelAtPeriodEnd`), a move due by then, a SCHEDULED checkout starting
  by then, a year paid once, and a monthly term's end (DEC-100's notices).
  Email only: no inbox notice for a routine charge. Before it, the domain
  step (DEC-139, `domain-plan-notice.ts` `sweepDomains`): for every
  business with a connected domain it tells an end the plan's own notices
  didn't, starts the 3-day clock when the plan stops including a domain,
  says once when the domain is paused, and clears its claims once the plan
  includes one again. Its claims are `DOMAIN_ENDING`
  (`domain-ending:<end>:<stage>`), `DOMAIN_PLAN_ENDED`
  (`domain-plan-ended`) and `DOMAIN_PAUSED` (`domain-paused:<clock>`); its
  email is `billing.email` kind `DOMAIN`, re-read before it is sent.
