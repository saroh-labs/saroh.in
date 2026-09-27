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
 * means a failure here can never roll back a payment.
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
 * Every paying store customer without a link, per business, each business
 * in its own transaction. Idempotent: a second run finds the ones it made
 * linked, and the ones it left still held, and changes nothing.
 */
export async function backfillPayingCustomerContacts(
    prisma: PrismaClient,
    normaliseEmail: EmailNormaliser = normaliseBackfillEmail,
): Promise<PayingCustomerContactsReport> {
    const orgs = await prisma.order.findMany({
        where: { paymentStatus: "PAID", organizationId: { not: null } },
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
        const outcomes = await prisma.$transaction(
            async (tx) => {
                const customers = await tx.customer.findMany({
                    where: {
                        orders: {
                            some: { organizationId, paymentStatus: "PAID" },
                        },
                        identityLinks: { none: {} },
                    },
                    select: { id: true },
                    orderBy: { createdAt: "asc" },
                });
                const out: PayingLinkOutcome[] = [];
                // Oldest first, so of two storefronts' customers with one
                // email the first to exist gets the contact.
                for (const { id } of customers) {
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
            },
            { timeout: 120_000 },
        );
        if (outcomes.length === 0) continue;
        report.organizations += 1;
        report.unlinked += outcomes.length;
        for (const o of outcomes) {
            if (o === "made") report.made += 1;
            if (o === "suggested") report.suggested += 1;
            if (o === "skipped") report.skipped += 1;
        }
    }
    return report;
}
