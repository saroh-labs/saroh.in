/**
 * C2 — a contact for every paying customer (DEC-041).
 *
 * A storefront's customer (`Customer`) who has paid gets a Contact of their
 * own, linked to them, so the business-wide Customers list (keyed on the
 * Contact) can show them. `linkPayingCustomer` is the one rule; the backfill
 * below runs it for every paying store customer without a link, and the API
 * runs it whenever an order is paid (`customer-workspace/ensure-contact.ts`).
 *
 * For one store customer who has paid and has no link:
 *
 * - **no usable email** (blank, or a reserved placeholder — privacy removal
 *   anonymises a store customer to one) → skipped: nobody to make a
 *   contact for;
 * - **a contact already holds the email** (compared without case), or a
 *   live site account signs in with it → nothing is made and nothing
 *   linked. Linking silently is what #120 refused; the pair is suggested
 *   instead (`duplicates.ts`), and the customers list counts them as
 *   paying customers not linked yet (C3);
 * - otherwise → a new contact with their email, name and phone, and a link
 *   with no team member on it and the reason given (BACKFILL or PAYMENT).
 *
 * It takes no lock. Two payments for one customer at once both try to make
 * the contact; the unique email makes the second wait for the first, and it
 * then finds the first's link. A contact made with `ON CONFLICT DO NOTHING`
 * never fails on a taken email; anything else that goes wrong in the payment
 * path (a lock it waits too long for) is caught there, in a savepoint, and
 * the payment goes on (`customer-workspace/ensure-contact.ts`, review C-3).
 *
 * "Paid" is an order paid for, refunded since or not — the rule the
 * Customers list counts paying customers by.
 *
 * Emails are read through a normaliser the caller passes: the API passes
 * `customer-workspace/duplicates.ts`'s `normaliseEmail`, which reads
 * `contacts/contact-email.ts`'s reserved placeholders. This package can't
 * import the API, so the backfill's CLI passes `normaliseBackfillEmail`
 * below, and the API's integration spec checks the two agree on every
 * placeholder shape.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/paying-customer-contacts.cli.ts`
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Why a link is made here. Staff and site-account links are made elsewhere. */
export type PayingLinkReason = "BACKFILL" | "PAYMENT";

/** What happened to one store customer. */
export type PayingLinkOutcome =
    /** Already linked to a contact: nothing to do. */
    | "already-linked"
    /** A contact was made and linked. */
    | "made"
    /** A contact or site account already holds the email: left for staff. */
    | "suggested"
    /** No usable email: nobody to make a contact for. */
    | "skipped";

/** Trimmed and lower-cased; null for none, or for a reserved placeholder. */
export type EmailNormaliser = (
    email: string | null | undefined,
) => string | null;

/**
 * The backfill CLI's normaliser: trimmed, lower-cased, and null for any
 * address under `.invalid` (RFC 2606), the domain every reserved contact
 * placeholder is built on (`contacts/contact-email.ts`).
 */
export const normaliseBackfillEmail: EmailNormaliser = (email) => {
    const value = email?.trim().toLowerCase();
    if (!value || value.endsWith(".invalid")) return null;
    return value;
};

const blankToNull = (v: string | null | undefined) => {
    const t = v?.trim();
    return t === undefined || t === "" ? null : t;
};

/**
 * Give one paying store customer a contact, by the rules above. The caller
 * has decided they paid; this doesn't look at orders.
 */
export async function linkPayingCustomer(
    tx: Tx,
    input: {
        organizationId: string;
        customerId: string;
        reason: PayingLinkReason;
    },
    normaliseEmail: EmailNormaliser,
    /**
     * Ids and a time for what is made, instead of generated ones and now.
     * Only the seed passes them: every row it writes carries its prefix so
     * its teardown is exact, and it dates the link to the first payment.
     */
    fixed?: { contactId: string; linkId: string; at: Date },
): Promise<PayingLinkOutcome> {
    const { organizationId, customerId, reason } = input;
    const linked = () =>
        tx.customerIdentityLink.findFirst({
            where: { customerId, organizationId },
            select: { id: true },
        });
    if (await linked()) return "already-linked";

    const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { email: true, firstName: true, lastName: true, phone: true },
    });
    const email = normaliseEmail(customer?.email);
    if (!customer || !email) return "skipped";

    const [holder, account] = await Promise.all([
        tx.contact.findFirst({
            where: {
                organizationId,
                email: { equals: email, mode: "insensitive" },
            },
            select: { id: true },
        }),
        tx.customerAccount.findFirst({
            where: { organizationId, email, status: { not: "REMOVED" } },
            select: { id: true },
        }),
    ]);
    if (holder || account) return "suggested";

    const made = await tx.contact.createMany({
        data: [
            {
                organizationId,
                email,
                firstName: blankToNull(customer.firstName),
                lastName: blankToNull(customer.lastName),
                phone: blankToNull(customer.phone),
                source: `store-customer:${customerId}`,
                ...(fixed ? { id: fixed.contactId, createdAt: fixed.at } : {}),
            },
        ],
        skipDuplicates: true,
    });
    if (made.count === 0) {
        // Another transaction made a contact with this email first: a
        // payment for this same customer (which linked them) or someone
        // else's (which holds the email now).
        return (await linked()) ? "already-linked" : "suggested";
    }
    const contact = await tx.contact.findUniqueOrThrow({
        where: { organizationId_email: { organizationId, email } },
        select: { id: true },
    });
    await tx.customerIdentityLink.createMany({
        data: [
            {
                organizationId,
                contactId: contact.id,
                customerId,
                reason,
                linkedByUserId: null,
                ...(fixed ? { id: fixed.linkId, createdAt: fixed.at } : {}),
            },
        ],
        skipDuplicates: true,
    });
    return "made";
}

export interface PayingCustomerContactsReport {
    /** Businesses with at least one paying store customer without a link. */
    organizations: number;
    /** Paying store customers without a link when the run started. */
    unlinked: number;
    /** Contacts made, each linked to its store customer. */
    made: number;
    /** Left for staff: a contact or site account already holds the email. */
    suggested: number;
    /** No usable email. */
    skipped: number;
}

/**
 * An order that was paid for, whether or not it was refunded since — the
 * rule the Customers list counts paying customers by (`PAID_ORDER` in
 * `customers-list.sql.ts`), so the backfill links everyone the list's
 * "not linked yet" notice names (review C-4).
 */
const PAID_STATUSES = ["PAID", "REFUNDED"];

/**
 * How many store customers one transaction links. Small, so each backfill
 * transaction holds its locks for a moment: a payment that makes a contact
 * for the same email never waits long behind it (review C-3).
 */
export const BACKFILL_BATCH_SIZE = 50;

/** Each batch's transaction: a minute to run, ten seconds to get a connection. */
const BATCH_TRANSACTION = { timeout: 60_000, maxWait: 10_000 } as const;

/**
 * Every paying store customer without a link, per business, a small batch
 * per transaction. Idempotent: a second run finds the ones it made linked,
 * and the ones it left still held, and changes nothing.
 */
export async function backfillPayingCustomerContacts(
    prisma: PrismaClient,
    normaliseEmail: EmailNormaliser = normaliseBackfillEmail,
    batchSize: number = BACKFILL_BATCH_SIZE,
): Promise<PayingCustomerContactsReport> {
    const orgs = await prisma.order.findMany({
        where: {
            paymentStatus: { in: PAID_STATUSES },
            organizationId: { not: null },
        },
        distinct: ["organizationId"],
        select: { organizationId: true },
        orderBy: { organizationId: "asc" },
    });
    const report: PayingCustomerContactsReport = {
        organizations: 0,
        unlinked: 0,
        made: 0,
        suggested: 0,
        skipped: 0,
    };
    for (const { organizationId } of orgs) {
        if (!organizationId) continue;
        let seen = 0;
        // Oldest first, so of two storefronts' customers with one email the
        // first to exist gets the contact. A cursor, not a re-read, walks
        // them: the ones left for staff stay unlinked and would come back.
        let after: { id: string; createdAt: Date } | undefined;
        for (;;) {
            const batch = await prisma.customer.findMany({
                where: {
                    orders: {
                        some: {
                            organizationId,
                            paymentStatus: { in: PAID_STATUSES },
                        },
                    },
                    identityLinks: { none: {} },
                    ...(after
                        ? {
                              OR: [
                                  { createdAt: { gt: after.createdAt } },
                                  {
                                      createdAt: after.createdAt,
                                      id: { gt: after.id },
                                  },
                              ],
                          }
                        : {}),
                },
                select: { id: true, createdAt: true },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: batchSize,
            });
            if (batch.length === 0) break;
            after = batch[batch.length - 1];
            // Up to `batchSize` customers' links in one transaction: Prisma's
            // 5-second default aborts every run on a slow connection.
            const outcomes = await prisma.$transaction(async (tx) => {
                const out: PayingLinkOutcome[] = [];
                for (const { id } of batch) {
                    out.push(
                        await linkPayingCustomer(
                            tx,
                            {
                                organizationId,
                                customerId: id,
                                reason: "BACKFILL",
                            },
                            normaliseEmail,
                        ),
                    );
                }
                return out;
            }, BATCH_TRANSACTION);
            seen += outcomes.length;
            report.unlinked += outcomes.length;
            for (const o of outcomes) {
                if (o === "made") report.made += 1;
                if (o === "suggested") report.suggested += 1;
                if (o === "skipped") report.skipped += 1;
            }
            if (batch.length < batchSize) break;
        }
        if (seen > 0) report.organizations += 1;
    }
    return report;
}
