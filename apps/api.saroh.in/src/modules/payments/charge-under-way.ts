import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { LOOKUP_WINDOW_MS } from "../webhooks/payment-lookup-schedule";

/**
 * One charge at a time per invoice (round-2 D13, DEC-038). While an
 * autopay charge is under way on an invoice, nothing else may take money
 * for it: a pay-link intent is refused (409 "Autopay charge in progress"),
 * and "Pay now" (A8), Send and Send reminder (D17, F4) and Retry by link
 * are hidden. UPI Autopay waits a day or more on its pre-debit notice, so
 * without this a customer could pay by link and then be debited too.
 *
 * A leaf, so the invoices, subscriptions and payments modules can all ask
 * without importing each other's services.
 */

/** What the customer and the team are told while a charge is under way. */
export const AUTOPAY_CHARGE_IN_PROGRESS = "Autopay charge in progress";

/** A mandate charge's intent that is still open. */
export const OPEN_MANDATE_CHARGE = [
    "CREATED",
    "REQUIRES_PAYMENT",
    "PROCESSING",
];

/** An autopay charge under way on one invoice. */
export interface ChargeUnderWay {
    intentId: string;
    /** When the debit is (or was) asked for: its `debitAfter`, else when it began. */
    at: Date;
}

type Db = Pick<Prisma.TransactionClient, "paymentIntent">;

/**
 * The open mandate charges on these invoices, by invoice. A charge counts
 * while its debit has been asked for (PROCESSING: money may move), or its
 * mandate is still ACTIVE. One whose mandate was cancelled or paused since
 * is never debited — `MandateChargesService.charge` refuses it — so it no
 * longer blocks the pay link.
 */
export async function chargesUnderWay(
    db: Db,
    organizationId: string,
    invoiceIds: readonly string[],
): Promise<Map<string, ChargeUnderWay>> {
    const byInvoice = new Map<string, ChargeUnderWay>();
    if (invoiceIds.length === 0) return byInvoice;
    const rows = await db.paymentIntent.findMany({
        where: {
            organizationId,
            invoiceId: { in: [...invoiceIds] },
            viaMandateId: { not: null },
            // A sale's charge only: never D12B's ₹1 autopay check.
            purpose: null,
            status: { in: OPEN_MANDATE_CHARGE },
            OR: [
                { status: "PROCESSING" },
                { viaMandate: { is: { status: "ACTIVE" } } },
            ],
        },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            invoiceId: true,
            debitAfter: true,
            createdAt: true,
        },
    });
    for (const row of rows) {
        if (!row.invoiceId || byInvoice.has(row.invoiceId)) continue;
        byInvoice.set(row.invoiceId, {
            intentId: row.id,
            at: row.debitAfter ?? row.createdAt,
        });
    }
    return byInvoice;
}

/** The open mandate charge on one invoice, or null. */
export async function chargeUnderWayOn(
    db: Db,
    organizationId: string,
    invoiceId: string,
): Promise<ChargeUnderWay | null> {
    const found = await chargesUnderWay(db, organizationId, [invoiceId]);
    return found.get(invoiceId) ?? null;
}

/**
 * The charge under way on any unpaid invoice of these subscriptions, by
 * subscription: what the account, Subscription Detail and Home say as
 * "Autopay charge in progress · ‹date›".
 */
export async function subscriptionChargesUnderWay(
    db: Pick<Prisma.TransactionClient, "paymentIntent" | "invoice">,
    organizationId: string,
    subscriptionIds: readonly string[],
): Promise<Map<string, ChargeUnderWay & { invoiceId: string }>> {
    const bySubscription = new Map<
        string,
        ChargeUnderWay & { invoiceId: string }
    >();
    if (subscriptionIds.length === 0) return bySubscription;
    const unpaid = await db.invoice.findMany({
        where: {
            organizationId,
            subscriptionId: { in: [...subscriptionIds] },
            status: "ISSUED",
            paymentIntents: {
                some: {
                    viaMandateId: { not: null },
                    purpose: null,
                    status: { in: OPEN_MANDATE_CHARGE },
                },
            },
        },
        select: { id: true, subscriptionId: true },
    });
    const charges = await chargesUnderWay(
        db,
        organizationId,
        unpaid.map((i) => i.id),
    );
    for (const inv of unpaid) {
        const charge = charges.get(inv.id);
        if (!charge || !inv.subscriptionId) continue;
        const had = bySubscription.get(inv.subscriptionId);
        if (!had || charge.at < had.at) {
            bySubscription.set(inv.subscriptionId, {
                ...charge,
                invoiceId: inv.id,
            });
        }
    }
    return bySubscription;
}

/**
 * The other half of "one charge at a time": a pay-link checkout the
 * customer has open on the invoice. A sale's intent that isn't autopay's
 * (no mandate, no `purpose`, so never D12B's ₹1 check), not yet paid. Retiring
 * the link wouldn't stop it: the checkout already holds its provider order,
 * and the customer can finish it. So while one is open, autopay neither
 * queues, prepares nor debits a charge on the invoice, and Retry offers the
 * pay link, not autopay (`mandateRetryable`).
 *
 * Every window is measured from the checkout's **last activity**: when it
 * was made, or its newest PaymentAttempt — and, for a FAILED one, when it
 * failed (`updatedAt`: nothing writes a FAILED intent after). Not an open
 * intent's `updatedAt`: the pending sweep stamps `lastLookupAt` on it every
 * few hours, which is Saroh asking, not the customer paying.
 *
 * - **Open** (CREATED, REQUIRES_PAYMENT, PROCESSING): within
 *   {@link CHECKOUT_LIFE_MS}. A pay link's Razorpay order carries no expiry
 *   of its own (`createOrderIntent` sends none), and a "pay and authorise"
 *   order's expires with its set-up (`SETUP_TTL_MS`, a day), inside it. So
 *   the life is the pending sweep's window (`LOOKUP_WINDOW_MS`): the time
 *   Saroh still asks the provider about the order, and settles a late
 *   capture.
 * - **FAILED**: within {@link FAILED_CHECKOUT_MS} only. A Razorpay checkout
 *   retries on the same order, in the same session — the customer's next
 *   try comes while the window is still open in front of them, not days
 *   later. Counting a declined try for the whole life made one declined card
 *   stop autopay for three days (review 3).
 *
 * Past its window a checkout no longer keeps autopay off the invoice; a
 * payment on it after that is settled by its webhook, as owed back if
 * autopay took the invoice first. A charge that stood aside for one is
 * queued again when the window ends (`checkoutOpenUntil`, the charge job's
 * `stoodAside`).
 *
 * `now` is the caller's clock (the job's run, or the request's), so the
 * specs can move it; the timestamps compared are the database's.
 */
export const CHECKOUT_LIFE_MS = LOOKUP_WINDOW_MS;

/**
 * How long a FAILED pay-link try keeps the checkout open: an hour from its
 * last activity. Razorpay's modal retry is in the same session — a UPI
 * request is approved or lapses within minutes, a card's 3-D Secure page
 * likewise — so an hour covers a slow retry and a customer who looks away,
 * with room to spare. Longer only delays autopay for nothing: a UPI
 * charge resumed after it still waits `PRE_DEBIT_LEAD_HOURS` (26) on its
 * notice, and a card's debit an hour later lands the same day. Shorter
 * risks the double charge this rule exists for: autopay debiting while the
 * customer is still in the window, about to try again.
 */
export const FAILED_CHECKOUT_MS = 60 * 60 * 1000;

/** The pay-link intents that are checkouts at all (not autopay's). */
const PAY_LINK_SALE = {
    viaMandateId: null,
    purpose: null,
} satisfies Prisma.PaymentIntentWhereInput;

/** Last activity after `since`: made, or a try recorded, since then. */
function activeSince(
    since: Date,
    failed: boolean,
): Prisma.PaymentIntentWhereInput[] {
    return [
        failed ? { updatedAt: { gt: since } } : { createdAt: { gt: since } },
        { attempts: { some: { createdAt: { gt: since } } } },
    ];
}

/** The where of a pay-link checkout open at `now` (above). */
export function openCheckoutWhere(
    now: Date = new Date(),
): Prisma.PaymentIntentWhereInput {
    const at = now.getTime();
    return {
        ...PAY_LINK_SALE,
        OR: [
            {
                status: { in: OPEN_MANDATE_CHARGE },
                OR: activeSince(new Date(at - CHECKOUT_LIFE_MS), false),
            },
            {
                status: "FAILED",
                OR: activeSince(new Date(at - FAILED_CHECKOUT_MS), true),
            },
        ],
    };
}

/**
 * When one checkout stops counting as open (above): its last activity
 * plus its window. Kept beside {@link openCheckoutWhere}, which asks the
 * same in SQL; `subscriptions.charge.db.spec.ts` holds the two together.
 */
export function checkoutClosesAt(row: {
    status: string;
    createdAt: Date;
    updatedAt: Date;
    lastAttemptAt: Date | null;
}): Date {
    const failed = row.status === "FAILED";
    const own = failed ? row.updatedAt : row.createdAt;
    const last =
        row.lastAttemptAt && row.lastAttemptAt > own ? row.lastAttemptAt : own;
    return new Date(
        last.getTime() + (failed ? FAILED_CHECKOUT_MS : CHECKOUT_LIFE_MS),
    );
}

/** Whether a pay-link checkout is open on the invoice at `now` (above). */
export async function checkoutOpenOn(
    db: Db,
    organizationId: string,
    invoiceId: string,
    now: Date = new Date(),
): Promise<boolean> {
    const open = await db.paymentIntent.findFirst({
        where: { organizationId, invoiceId, ...openCheckoutWhere(now) },
        select: { id: true },
    });
    return open !== null;
}

/**
 * Which of these invoices have a pay-link checkout open at `now`: one
 * query for them all (Home and the subscriptions list ask for many).
 */
export async function checkoutsOpenOn(
    db: Db,
    organizationId: string,
    invoiceIds: readonly string[],
    now: Date = new Date(),
): Promise<Set<string>> {
    if (invoiceIds.length === 0) return new Set();
    const rows = await db.paymentIntent.findMany({
        where: {
            organizationId,
            invoiceId: { in: [...invoiceIds] },
            ...openCheckoutWhere(now),
        },
        distinct: ["invoiceId"],
        select: { invoiceId: true },
    });
    return new Set(rows.flatMap((r) => (r.invoiceId ? [r.invoiceId] : [])));
}

/**
 * When the checkouts open on the invoice at `now` have all closed, or null
 * when none is open: the moment a charge that stood aside for them may be
 * queued again.
 */
export async function checkoutOpenUntil(
    db: Db,
    organizationId: string,
    invoiceId: string,
    now: Date = new Date(),
): Promise<Date | null> {
    const rows = await db.paymentIntent.findMany({
        where: { organizationId, invoiceId, ...openCheckoutWhere(now) },
        select: {
            status: true,
            createdAt: true,
            updatedAt: true,
            attempts: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { createdAt: true },
            },
        },
    });
    let until: Date | null = null;
    for (const row of rows) {
        const closes = checkoutClosesAt({
            ...row,
            lastAttemptAt: row.attempts[0]?.createdAt ?? null,
        });
        if (!until || closes > until) until = closes;
    }
    return until;
}

/** The 409 every other way to pay answers while a charge is under way. */
export function autopayChargeInProgress(): ConflictException {
    return new ConflictException({
        message: AUTOPAY_CHARGE_IN_PROGRESS,
        details: { reason: "autopay-pending" },
    });
}
