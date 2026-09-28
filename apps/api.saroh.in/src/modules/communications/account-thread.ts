import type { Prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";

/**
 * The customer's account thread as a place Saroh can post to (round-2 D17).
 *
 * The thread itself is A13's, and the job that writes into it,
 * `customer.notify`, is A14's. D17 only decides when an invoice goes there,
 * and asks through this port, so the invoice is still enqueued from one
 * place (`invoices/invoice-send.service.ts`) and A14 adds no enqueue of its
 * own: A14 provides {@link ACCOUNT_THREAD_POSTER}, whose `post` writes its
 * job on the caller's transaction.
 *
 * Two things must both hold before the thread is ever offered:
 *  - a poster is provided (A14 has shipped), and
 *  - the `ACCOUNT_THREAD` rollout flag is on for the business, which the
 *    release manager turns on only once A13 is live in production.
 * Until then an invoice goes by email alone, and nothing is enqueued.
 */

/** What an invoice post says happened. */
export type AccountThreadInvoiceKind = "INVOICE_SENT" | "INVOICE_REMINDER";

export interface AccountThreadPost {
    organizationId: string;
    contactId: string;
    invoiceId: string;
    kind: AccountThreadInvoiceKind;
    /** The staff member who sent it; null for Saroh itself. */
    actorUserId: string | null;
}

/** A14's side: enqueue the thread post on the caller's transaction. */
export interface AccountThreadPoster {
    post(tx: Prisma.TransactionClient, input: AccountThreadPost): Promise<void>;
}

/** DI token A14 provides; optional until then. */
export const ACCOUNT_THREAD_POSTER = Symbol("ACCOUNT_THREAD_POSTER");

// Stateless: it reads the flag rows on every call.
const flags = new FeatureFlagService();

/**
 * Whether this business's account thread may be posted to at all: the
 * rollout flag, which fails closed while never configured.
 */
export function accountThreadOn(organizationId: string): Promise<boolean> {
    return flags.isEnabled(FlagKey.ACCOUNT_THREAD, organizationId);
}
