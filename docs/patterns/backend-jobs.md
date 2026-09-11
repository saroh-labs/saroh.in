# Background jobs

> **Read when:** enqueueing a background job, writing or registering a handler,
> or changing `apps/api.saroh.in/src/modules/jobs`.
> Adapted from claude-patterns `backend/05-jobs-and-locks.md`. Architecture:
> DEC-008.

## The model

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

### Every enqueued type has a handler, in the same change

Export the type as a constant beside its handler (`ENQUIRY_NOTIFY_TYPE`), and
register it in the module's `onModuleInit` through `JobHandlerRegistry`.
`modules/jobs/job-consumers.spec.ts` fails when a produced type has no handler
or a handler has no producer.

### A job with no handler is dead-lettered, never "done"

The worker marks it FAILED at once, with attempts untouched, the reason in
`lastError`, and an ERROR log. It used to complete as a no-op, which is how
every `booking.notify` was recorded as delivered while nothing was sent.

### Handlers are idempotent

Guard the effect with a unique constraint (a `Notification` unique on
`(leadId, type)`), write absolute values (analytics rollups), or keep a ledger
(`AutomationRun`, once per rule and lead). Write the durable record before the
best-effort side effect.

### Terminal writes are fenced on the lease

`complete`, `fail` and `deadLetter` update
`WHERE id = … AND status = 'PROCESSING' AND lockedBy = <worker>` and report
whether they won. Any new write to a claimed `Job` carries the same condition,
or a worker that lost its lease can resurrect a finished job and send it twice.
Reclaim is anchored on `lockedAt` (the claim), never `createdAt`.

### Know what the warnings mean

- `… after its lease was reclaimed; outcome not recorded` (WARN): occasional is
  fine; a steady stream means some handler outlives `JOB_VISIBILITY_MS`.
- `No handler registered for job type …; dead-lettered` (ERROR): a producer
  shipped without its consumer.

### Design

- A job that does two independent things is two jobs, so one failing cannot
  discard the other.
- Never enqueue a job the handler will no-op on.
- Payloads carry ids, not data; the handler re-reads current state and handles
  "it was deleted".
- Before adding an advisory lock, add a registry of lock ids to this file.

### Testing

`FakeJobQueue` mirrors the claim, the backoff and the lease fence. Drive the
worker with `runOnce()`; the poll loop does not start under `NODE_ENV=test`.

## Known gaps

| Type                  | Gap                                            | Consequence                                                                                    |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `booking.notify`      | Enqueued on booking and reschedule; no handler | Nobody is told. The jobs dead-letter, and rows marked DONE before that change were never sent. |
| `analytics.aggregate` | Handler registered; nothing enqueues it        | Rollups come only from the seed, so Insights tells real organizations no views were recorded.  |

Both are listed in `job-consumers.spec.ts`. Close a gap and delete its entry in
the same commit.
