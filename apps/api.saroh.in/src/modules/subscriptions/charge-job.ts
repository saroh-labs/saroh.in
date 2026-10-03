import type { Prisma } from "@saroh/database";

/**
 * The `subscription.charge` job (round-2 D13): a renewal's autopay charge,
 * run as the provider's two phases allow. Its own file, a leaf, so the
 * renewal (subscriptions) and the charge service (payments) can both
 * write it without importing each other.
 *
 * One job type, three steps, each a run of its own (`backend-jobs.md`: a
 * payload names ids, the handler re-reads):
 *
 * - `PREPARE`: the provider's order with its pre-debit notice
 *   (`MandateChargesService.prepareCharge`). Queued by the renewal, or by
 *   Retry, with the charge's CREATED intent in the same transaction, so
 *   "Autopay charge in progress" holds from that moment.
 * - `DEBIT`: at `debitAfter`, once the notice is delivered (or not needed),
 *   the debit (`charge`). Asked again hourly while the notice is out.
 * - `LOOK`: what the provider made of the debit, when its webhook hasn't
 *   said — the same look-up Retry does first (DEC-026).
 *
 * A charge that stands aside for a pay-link checkout the customer has open
 * writes a `PREPARE` with `resume` and a new key, for the moment that
 * checkout stops counting as open (`checkoutOpenUntil`), so autopay takes
 * the invoice up again without the merchant.
 *
 * **Lead time: the merchant's choice** (D13B, DEC-065,
 * `autopay-timing.ts`). By default (DAY_AFTER_RENEWAL, D13 as it shipped)
 * the renewal invoice is raised on the renewal date and falls due
 * `DEFAULT_DUE_DAYS` (7) days later, and the debit is asked for
 * `PRE_DEBIT_LEAD_HOURS` (26) after — Razorpay's 25-hour notice plus a
 * margin — leaving room for a Retry by mandate before it is overdue.
 * ON_RENEWAL_DATE raises the invoice two days early so the debit lands on
 * the renewal date (an early invoice dropped if the subscription is
 * cancelled, paused or changes plan first: `early-renewal.ts`);
 * ON_DUE_DATE debits at the start of the due date. Under those two the
 * planned debit is written on the charge's intent when it is queued
 * (`debitAfter` on the CREATED intent), PREPARE waits until two days
 * before it, and a method that needs no notice is still not debited
 * before it — so changing the setting never moves a charge already
 * queued.
 */

export const SUBSCRIPTION_CHARGE_TYPE = "subscription.charge";

export type ChargeStep = "PREPARE" | "DEBIT" | "LOOK";

export interface ChargeJobPayload {
    invoiceId: string;
    mandateId: string;
    /** Saroh's charge key: {@link chargeKey}. */
    key: string;
    step: ChargeStep;
    /** How many times this step has already found "not yet". */
    tries?: number;
    /**
     * A PREPARE written when a charge stood aside for a pay-link checkout
     * (`stoodAside`), to run when that checkout closes: its key names no
     * intent yet, and the run queues the charge afresh if autopay may still
     * take the invoice then.
     */
    resume?: boolean;
}

/** The charge key: one per invoice and attempt, so a retry is a new order. */
export function chargeKey(invoiceId: string, attempt: number): string {
    return `inv_${invoiceId}_${attempt}`;
}

/** A retry's wait when the provider gave no answer to step one. */
export const PREPARE_RETRY_MS = 15 * 60 * 1000;
/** Asks for step one before the charge is given up (about three hours). */
export const PREPARE_TRIES = 12;
/** How often a debit waiting on its notice is asked for again. */
export const DEBIT_RETRY_MS = 60 * 60 * 1000;
/** Asks while the notice is out before the charge is given up (two days). */
export const DEBIT_TRIES = 48;
/**
 * When to look a taken debit up if its webhook hasn't settled it: a UPI
 * debit can take 24–36 hours to be answered (D11 spike).
 */
export const LOOK_AFTER_MS = 36 * 60 * 60 * 1000;
/** A look-up's wait when the provider gave no answer, or none yet. */
export const LOOK_RETRY_MS = 6 * 60 * 60 * 1000;
/** Look-ups before the charge is left for Retry (about four more days). */
export const LOOK_TRIES = 16;

/** The job's payload, or null when it doesn't name a charge. */
export function chargePayloadOf(payload: unknown): ChargeJobPayload | null {
    if (typeof payload !== "object" || payload === null) return null;
    const p = payload as Record<string, unknown>;
    const step = p.step;
    if (
        typeof p.invoiceId !== "string" ||
        typeof p.mandateId !== "string" ||
        typeof p.key !== "string" ||
        (step !== "PREPARE" && step !== "DEBIT" && step !== "LOOK")
    ) {
        return null;
    }
    return {
        invoiceId: p.invoiceId,
        mandateId: p.mandateId,
        key: p.key,
        step,
        tries: typeof p.tries === "number" ? p.tries : 0,
        ...(p.resume === true ? { resume: true } : {}),
    };
}

/**
 * Write a step's job, unless that step of this charge is already waiting
 * (a job run twice must not fork the chain). Always a new row: the worker
 * completes the run that wrote it.
 */
export async function enqueueChargeStepInTx(
    tx: Pick<Prisma.TransactionClient, "job">,
    organizationId: string,
    payload: ChargeJobPayload,
    runAt: Date,
): Promise<void> {
    const waiting = await tx.job.findFirst({
        where: {
            organizationId,
            type: SUBSCRIPTION_CHARGE_TYPE,
            status: "PENDING",
            AND: [
                { payload: { path: ["key"], equals: payload.key } },
                { payload: { path: ["step"], equals: payload.step } },
            ],
        },
        select: { id: true },
    });
    if (waiting) return;
    await tx.job.create({
        data: {
            organizationId,
            type: SUBSCRIPTION_CHARGE_TYPE,
            payload: { ...payload },
            runAt,
        },
    });
}
