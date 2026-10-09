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
- **Current** — **Advisory locks have a registry** (below). A new
  `pg_advisory_xact_lock` adds its row in the same change.

### Advisory lock registry — **Current**

Each is a transaction lock on `hashtext(<key>)`, held until the
transaction ends. Take it before the transaction's row locks, so it never
waits while holding one.

| Key                                       | Serialises                                                                                                                                                  | Where                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-pack:<organizationId>:<contactId>` | Selling a "first pack only" pack to one person                                                                                                              | `class-packs/first-pack.ts`                                                                                                                     |
| `subscription-plan-name:<organizationId>` | Saving a subscription plan's name in one business                                                                                                           | `subscriptions/plans.ts` (`lockPlanNames`)                                                                                                      |
| `plan-meter:<organizationId>:<limitKey>`  | Writes that add to one plan limit (a product, a booking…); a booking notice Saroh will email takes `…:sarohEmailsPerMonth` before its first write (DEC-086) | `billing/metering.service.ts` (`lockMeter`, U13); `customer-notify.handler.ts` (the one notice site; `booking.notify` writes nothing before it) |

Race tests wait on an advisory lock with `waitUntilAdvisoryBlockedBy`
(`test/lock-wait.ts`).

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
  left of it would shrink its rollup. It logs counts only.

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
  invitation accepted. `booking.notify` writes its team notice itself (A14)
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
  unpublished or deleted, trackers saved or switched by Saroh, and the
  catalogue. **Stock is heard at its locks:** every flow that changes a
  stock row or how a product counts takes `lockStockLevels`, `lockProduct`
  or `lockProducts` (`products/stock-levels.ts`, the lock order), and those
  queue on the same transaction, once per row or product per transaction.
  A new stock writer that keeps the lock order is covered; one that skips
  it isn't. `page-cache-triggers.spec.ts` pins the rest. A price or detail
  saved outside a transaction queues after its write.
- **A business with no live site still queues** on a stock change: knowing
  would cost a read in the hottest stock paths, so the handler finds no
  site and ends. The one place the "never enqueue a no-op" rule bends.

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
  provider, and a refusal (already cancelled) isn't retried.
- **`billing.email`** (U17) is Saroh's own mail to a business: an
  invoice with its PDF (queued with the invoice), a failed charge (queued by
  the webhook on `pending` or `halted`), a first month or a free trial
  ending (U16 queues it, `enqueueBillingEmail`), a plan that ends (#805)
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
  subscription's move is applied by its renewal webhook first.
