import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { accountAreaOn } from "../site-accounts/account-area";

/**
 * The customer's account thread as a place Saroh can post to (round-2 D17).
 *
 * The thread itself is A13's, and so is the poster:
 * `site-accounts/thread-poster.ts` provides {@link ACCOUNT_THREAD_POSTER}
 * (registered in `InvoicesModule`), whose `post` writes a SYSTEM message
 * carrying the invoice on the caller's transaction, so D17's once-sent and
 * one-reminder-a-day rules count it. D17 only decides when an invoice goes
 * there, and the invoice is still sent from one place
 * (`invoices/invoice-send.service.ts`); A14 adds no enqueue of its own.
 *
 * Before the thread is ever offered a poster must be provided (A13), and
 * {@link accountThreadOn} must say yes: the one rule every post of Saroh's
 * own goes through. Until then an invoice goes by email alone, and nothing
 * is enqueued.
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

/** A13's side: write the thread post on the caller's transaction. */
export interface AccountThreadPoster {
    post(tx: Prisma.TransactionClient, input: AccountThreadPost): Promise<void>;
}

/** DI token A13 provides (`InvoicesModule`); optional to the send. */
export const ACCOUNT_THREAD_POSTER = Symbol("ACCOUNT_THREAD_POSTER");

// Stateless: it reads the flag rows on every call.
const flags = new FeatureFlagService();

/**
 * Whether Saroh could post to this business's account threads at all: the
 * account area is on for the instance (`SITE_ACCOUNT_AREA`) and the
 * `ACCOUNT_THREAD` rollout flag is on for the business (it fails closed
 * while never configured). The business's own choice is not asked here:
 * this is what says whether that choice can have an effect, so the
 * workspace offers it only then.
 */
export async function accountThreadOffered(
    organizationId: string,
): Promise<boolean> {
    if (!accountAreaOn()) return false;
    return flags.isEnabled(FlagKey.ACCOUNT_THREAD, organizationId);
}

/**
 * The business's own choice (12 Oct 2026, `BusinessProfile.accountUpdates`):
 * Saroh posts order, booking and invoice updates into its customers'
 * Messages. On by default; a business with no profile yet reads as on.
 */
export async function accountUpdatesChosen(
    organizationId: string,
): Promise<boolean> {
    const profile = await prisma.businessProfile.findUnique({
        where: { organizationId },
        select: { accountUpdates: true },
    });
    return profile?.accountUpdates ?? true;
}

/**
 * Whether Saroh may post its own updates to this business's account
 * threads. Three things must all hold, and this is the one place they are
 * asked together (`notice-reach.ts` and the invoice send both come here):
 *
 *  1. the account area is on for the instance (`SITE_ACCOUNT_AREA`);
 *  2. the `ACCOUNT_THREAD` rollout flag is on for the business;
 *  3. the business has not turned its updates off.
 *
 * Off for any reason reads the same to a caller: the thread is not a
 * channel, and each does what it did before the thread existed (email
 * through the business's own provider where there is one, else nothing).
 *
 * Only Saroh's own posts ask this. The team's replies and what a customer
 * writes (`site-accounts/threads.service.ts`) never did, and still don't.
 */
export async function accountThreadOn(
    organizationId: string,
): Promise<boolean> {
    if (!(await accountThreadOffered(organizationId))) return false;
    return accountUpdatesChosen(organizationId);
}
