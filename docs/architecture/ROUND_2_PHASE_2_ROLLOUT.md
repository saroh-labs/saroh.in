# Round 2, Phase 2 rollout

> **Read when:** releasing a round-2 Phase 2 checkpoint (`feat/round-2-phase-2`)
> from development to production, or rolling one back. Plan:
> `docs/plans/2026-09-28-001-round-2-phase-2-waves-plan.md` (its Release
> boundaries say why each checkpoint exists). Each unit that needs a step at
> release adds its own section here. Referenced from
> `docs/patterns/devops-tooling-and-deploy.md`.

---

## D22: Razorpay's public key id (CP-1)

Decision: DEC-054. Razorpay's checkout window opens with the business's key
id, which is public. Setup used to keep it only inside the sealed
credentials, so a connection saved without the old optional "Public key"
couldn't open the window. From this release:

- setup stores the Razorpay key id as the connection's `publicKey` (and
  checks it and the secret first);
- **the API makes no payment for a Razorpay connection without a public
  key**, and the booking page stops offering "Pay now" for it;
- Settings › Providers shows such a connection as **Needs attention**, with
  "Add key id".

So every existing Razorpay connection must have its public key **before the
new API serves**, or those businesses lose online pay. The backfill does it.
There is no migration: `MerchantPaymentProvider.publicKey` already exists.

### Before deploying the API

1. **Run the backfill against production**, from a checkout of the release
   commit. It writes only `publicKey`, a column the old API already reads
   and writes, so it is safe while the old API serves.
   `PAYMENTS_ENC_KEY` is the production API's own (it opens the sealed key
   ids); take it from the API host's environment and never paste it into an
   issue, a PR or this file.

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> PAYMENTS_ENC_KEY=... \
      pnpm --filter @saroh/database exec tsx src/backfill/razorpay-public-keys.cli.ts
    ```

    It prints:

    ```text
    [razorpay-public-keys] Razorpay connections: <n>, public keys filled: <n>, already set: <n>, unreadable: <n>
    ```

    Record the four numbers in the release issue. **"Unreadable" must be 0.**
    If it isn't, a second line names those connections by id (nothing
    else); their credentials don't open with this key (the wrong
    `PAYMENTS_ENC_KEY`, most likely) or hold no key id. Stop and find out
    which before deploying: with the right key it is 0, and a connection
    that really is broken will read "Needs attention" and take no online
    payment until its merchant enters the keys again — tell that merchant
    first.

### Deploy

2. **Deploy the API** as usual, and wait for `/health/ready`.
3. **Run the backfill again**, the same command. It catches a connection
   the old app saved between step 1 and the deploy. It prints 0 filled
   unless someone connected Razorpay in that window.
4. **Then the workspace** (`app.saroh.in`), with Providers' Needs attention
   state and the new setup dialog. The old workspace on the new API is
   safe: a key id it sends is checked and stored as the public key, and an
   optional "Public key" it sends must match it (a different one is refused
   with a message saying they are the same code for Razorpay).

### Verify

5. No connected Razorpay account is left without its key (read-only; must
   return 0, or the number step 1 named and the team has told):

    ```sql
    SELECT count(*) FROM "MerchantPaymentProvider"
    WHERE provider = 'RAZORPAY' AND status = 'CONNECTED'
      AND ("publicKey" IS NULL OR "publicKey" = '');
    ```

6. A third run of the backfill prints `public keys filled: 0`.
7. With Razorpay test keys (waves plan, Risks): connect Razorpay on a test
   business, open a booking page, choose Pay now, and the Razorpay window
   opens.

### Rollback

Deploy the previous API tag and the previous workspace. The public keys
the backfill wrote stay; the old API sends them in the checkout handoff,
which is what its checkout needed all along, so nothing breaks. Nothing
needs undoing.

### Cashfree (noted, not changed)

Cashfree's drop-in opens on the order's payment session, so it needs no
public key and its setup is unchanged. It shows whatever methods the
business's Cashfree account has on, because the order Saroh creates sets
none (`providers/cashfree.provider.ts`), while Razorpay's window is limited
to UPI and card (`packages/site-blocks/src/booking-flow/checkout.ts`). The
booking page promises "UPI or card". Limiting Cashfree the same way would
mean setting `order_meta.payment_methods` (for example `"upi,cc,dc"`) on the
order; it is left for a decision.

---

## D17: sending an invoice (wave 2)

"Send with pay link" and "Send reminder" on Invoice Detail, through the
business's own connected email provider (`invoices/invoice-send.service.ts`,
the transactional path in `communications/communications.service.ts`).

- **Migration** `20261013160000_invoice_messages`: two nullable columns on
  `Message` (`invoiceId`, `template`), an index and a foreign key. Additive;
  the old API never reads them.
- **API before app.** The workspace shows Send only when the invoice read
  carries a `send` flag with a channel, so the new app on the old API shows
  "Copy pay link" as before, and the old app ignores the new fields.
- **The account thread stays off.** The thread channel needs A14's poster
  (not yet built) **and** the `ACCOUNT_THREAD` flag. Leave the flag without
  a row until A13 and A14 are live in production (waves plan, boundary 6);
  never configured, it is off.
- Nothing changes for a business without a connected email provider: no
  Send, and the Payment panel points at Settings › Providers.

### Verify

1. On a test business with an email provider and a payment provider, open an
   unpaid invoice: "Send with pay link" is offered; send it. The email
   arrives with a pay link that opens the pay page; "What happened" says
   "Sent to …".
2. "Send reminder" is then offered but off, and the Payment panel says when
   the next can go.
3. Without an email provider: no Send, only "Copy pay link".

### Rollback

A queued send whose job has not run yet carries its pay link sealed in the
job, and its stored body holds a slot the old API's worker doesn't fill.
Before deploying the previous API, check no such job is waiting, or it goes
out with the slot instead of the link:

```sql
SELECT count(*) FROM "Job"
WHERE type = 'message.send' AND status IN ('PENDING', 'PROCESSING')
  AND payload ? 'link';
```

Wait for 0 (the worker sends them within seconds). The two columns stay;
the old API ignores them.
