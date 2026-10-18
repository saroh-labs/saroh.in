import type { Prisma } from "@saroh/database";

type Tx = Pick<Prisma.TransactionClient, "billingAction">;

/**
 * Every code a billing action is raised with (DEC-166), in one list, so a
 * new one can't be raised without being named here first: the raise
 * functions take only these. Admin › Billing › Needs action says each in
 * words (`apps/admin.saroh.in/lib/billing-action-words.ts`, whose test
 * reads this list and fails on a code it has no words for).
 */
export const BILLING_ACTION_CODES = [
    "billing_double_charge_refund_owed",
    "billing_double_charge_refund_given_up",
    "billing_provider_cancel_stuck",
    "billing_provider_cancel_given_up",
    "billing_webhook_unmatched",
    "billing_reconcile_payment_unmatched",
    "saroh_invoice_amount_mismatch",
    "billing_credit_note_may_be_needed",
    "billing_refund_failed",
    "billing_dispute_open",
    "billing_customer_refused",
    "billing_payment_notes_given_up",
    "billing_profile_owner_left",
    "billing_profile_gone",
] as const;

export type BillingActionCode = (typeof BILLING_ACTION_CODES)[number];

/** Ids an operator follows a billing action by; empty values are left out. */
export type BillingActionRefs = Record<string, string | null | undefined>;

/**
 * Something about Saroh's billing an operator must act on by hand (DEC-166),
 * as a row Admin › Billing › Needs action lists across businesses until it
 * is marked resolved: `BillingAction`. Written on the caller's transaction,
 * so it stands or falls with the change that found it. Every billing ops
 * notice writes one (`billing-ops-notice.ts`); the daily reconcile, an
 * unmatched webhook and a refund on an invoice write their own.
 *
 * `dedupeKey` makes a raise that repeats (the reconcile runs daily, a
 * provider redelivers) one row: a second raise with the same key writes
 * nothing, resolved or not. Without one, every raise is its own row.
 *
 * Never a credential or a card detail: ids and Saroh's own words only.
 * Returns whether a row was written.
 */
export async function raiseBillingActionInTx(
    tx: Tx,
    input: {
        organizationId: string | null;
        /** The log code, e.g. `billing_double_charge_refund_given_up`. */
        code: BillingActionCode;
        refs: BillingActionRefs;
        /** What happened and what to do. */
        note: string;
        dedupeKey?: string | null;
    },
): Promise<boolean> {
    const written = await tx.billingAction.createMany({
        data: [
            {
                organizationId: input.organizationId,
                code: input.code,
                refs: cleanRefs(input.refs),
                note: input.note,
                dedupeKey: input.dedupeKey ?? null,
            },
        ],
        skipDuplicates: true,
    });
    return written.count > 0;
}

/** The refs with nothing empty, as stored and shown. */
export function cleanRefs(refs: BillingActionRefs): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(refs)) {
        if (value) out[key] = value;
    }
    return out;
}
