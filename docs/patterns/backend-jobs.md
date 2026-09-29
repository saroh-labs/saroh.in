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
  `maxAttempts` (5), and the job is then FAILED.

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
- **Current** — **Payloads carry ids, not data;** the handler re-reads current
  state and handles "it was deleted" (`enquiry-notify.handler.ts`).
- **Adopted** — **Advisory locks have a registry.** None are in use; add the
  registry to this file before the first one.

### Know what the warnings mean — **Current**

- `… after its lease was reclaimed; outcome not recorded` (WARN): occasional is
  fine; a steady stream means some handler outlives `JOB_VISIBILITY_MS`.
- `No handler registered for job type …; dead-lettered` (ERROR): a producer
  shipped without its consumer.

### Testing — **Current**

`FakeJobQueue` mirrors the claim, the backoff and the lease fence. Drive the
worker with `runOnce()`; the poll loop does not start under `NODE_ENV=test`.

## Known gaps

| Type                  | Gap                                     | Consequence                                                                                   |
| --------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `analytics.aggregate` | Handler registered; nothing enqueues it | Rollups come only from the seed, so Insights tells real organizations no views were recorded. |

It is listed in `job-consumers.spec.ts`. Close a gap and delete its entry in
the same commit. It needs a product decision first (`saroh-product.md`).

`booking.notify` was the other gap: enqueued on every booking and
reschedule from S4-002 with no handler, so its jobs dead-lettered and
nobody was told. Round-2 A14 closed it (`bookings/booking-notify.handler.ts`).

## Customer notices — **Current** (A14)

- **`booking.notify`** (booked, moved, cancelled, a hold paid) tells the
  team when the customer moved or cancelled it themselves (a
  `Notification`), and delegates the customer's side to
  `CustomerNotifyService`. **`customer.notify`** carries an order step
  (Ready, handed over), queued 10 seconds ahead so an Undo deletes it
  unsent (`cancelOrderStepNotice`); A12 adds the waitlist offer.
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

## Autopay charges — **Current** (D13)

- **`subscription.charge`** runs a renewal's autopay charge in steps, each
  its own run (`subscriptions/charge-job.ts`): `PREPARE` (the order and its
  pre-debit notice), `DEBIT` (at `debitAfter`, asked again hourly while the
  notice is out), `LOOK` (the debit looked up when its webhook is late).
  The renewal writes the first step with the charge's intent on its own
  transaction; each step writes the next with `enqueueChargeStepInTx`,
  which skips a step already waiting for that charge, so a redelivered run
  never forks the chain. The debit is claimed on the intent before it is
  asked, so a run delivered twice debits once.

## Team alerts — **Current** (F14)

- **`team.alert`** tells the business's own team, as each person chose in
  Settings › Your profile (`notifications/alert-preferences.ts`). A
  producer calls `enqueueTeamAlert(tx, …)` on its own transaction
  (`notifications/team-alerts.ts`): a new order (the create, and an online
  checkout's payment), an invoice's pay link failing (the webhook), an
  invitation accepted. `booking.notify` writes its team notice itself (A14)
  and queues `team.alert` with that notice's id for the email only.
- **One notice, filtered per person.** The bell is one org-wide
  `Notification`; `NotificationsService` leaves out, per viewer, the types
  of rows they turned the bell off for or can't read. Email goes through
  the business's own provider (`queueTransactional`, recipient
  `TEAM_MEMBER`) to each member whose role reads it and who has email on.
- **Once per event**, claimed as a `CustomerNotice` (`TEAM_TOLD`,
  `team:<event>:<id>`), and re-read first: an unpaid checkout, a payment
  that went through after all, or someone who left again is not announced.
