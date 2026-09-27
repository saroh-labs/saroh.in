import { Logger } from "@nestjs/common";
import type { PayingLinkOutcome, Prisma } from "@saroh/database";
import { linkPayingCustomer } from "@saroh/database";

import { normaliseEmail } from "./duplicates";

const logger = new Logger("EnsureContact");

/** The savepoint the contact is made under, inside the payment's transaction. */
const SAVEPOINT = "ensure_paying_contact";

/**
 * How long making the contact may wait for a lock before it gives up (a
 * backfill batch or another payment holding the email). Short: the payment
 * waits this long at most, then goes on without the contact.
 */
export const ENSURE_CONTACT_LOCK_TIMEOUT = "2s";

/**
 * What failed, without the message: a Prisma error's message quotes the
 * call's arguments, the customer's email among them.
 */
function errorKind(error: unknown): string {
    if (error && typeof error === "object") {
        const { code, name } = error as { code?: unknown; name?: unknown };
        if (typeof code === "string") return `code ${code}`;
        if (typeof name === "string") return name;
    }
    return "unknown error";
}

/**
 * A contact for the customer who just paid (DEC-041, C2).
 *
 * Runs in the transaction that makes the order's invoice
 * (`invoices/order-invoicing.ts` `ensureOrderInvoice`, under the order's row
 * lock), so the link lands or rolls back with the payment and needs no lock
 * of its own.
 *
 * It never fails or rolls back the payment (review C-3). It runs under a
 * savepoint with a short `lock_timeout`; if anything goes wrong — a lock
 * waited on too long, any error — the savepoint is rolled back, a warning is
 * logged with the ids, and the payment goes on. The store customer is then
 * left unlinked, which the Customers list names for staff ("paying customers
 * aren't linked to a contact yet"), and their next payment or the backfill
 * tries again. A WARN now and then is a busy moment; a steady stream means
 * the contact rule itself is failing and wants looking at.
 *
 * The rule is `linkPayingCustomer` in `@saroh/database`, the one
 * the backfill runs: a store customer with no link gets a new contact and a
 * PAYMENT link with no team member on it; one whose email a contact or a
 * site account already holds is left for staff to link or merge, never
 * linked silently (#120). Emails are read through `duplicates.ts`, so a
 * reserved placeholder is no email.
 *
 * Skipped, with nothing written:
 * - an order that isn't paid;
 * - a walk-in: no store customer (B13 makes `Order.customerId` nullable) or
 *   one with no email (default 19) — there is nobody to make a contact for;
 * - an order with no business (from before ADR-001).
 */
export async function ensureContactForPaidOrder(
    tx: Prisma.TransactionClient,
    order: {
        organizationId: string | null;
        customerId: string | null;
        paymentStatus: string;
    },
): Promise<PayingLinkOutcome | null> {
    if (order.paymentStatus !== "PAID") return null;
    if (!order.organizationId || !order.customerId) return null;
    const { organizationId, customerId } = order;

    // SET LOCAL lasts to the end of the payment's transaction unless the
    // savepoint rolls back, so on success the old value is put back.
    const [{ lock_timeout: before }] = await tx.$queryRaw<
        { lock_timeout: string }[]
    >`SELECT current_setting('lock_timeout') AS lock_timeout`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${SAVEPOINT}`);
    try {
        await tx.$queryRaw`SELECT set_config('lock_timeout', ${ENSURE_CONTACT_LOCK_TIMEOUT}, true)`;
        const outcome = await linkPayingCustomer(
            tx,
            { organizationId, customerId, reason: "PAYMENT" },
            normaliseEmail,
        );
        await tx.$queryRaw`SELECT set_config('lock_timeout', ${before}, true)`;
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${SAVEPOINT}`);
        return outcome;
    } catch (error) {
        // Undoes whatever the contact rule wrote, and the lock_timeout.
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
        logger.warn(
            `Couldn't make a contact for a paying customer; the payment went on and they are left for staff (organization ${organizationId}, store customer ${customerId}, ${errorKind(error)})`,
        );
        return null;
    }
}
