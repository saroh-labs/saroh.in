import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { businessTimezone } from "../bookings/staff-availability";
import { isReservedContactEmail } from "../contacts/contact-email";
import { chargesUnderWay } from "../payments/charge-under-way";
import { takesPaymentOnline } from "../subscriptions/member-invoices";
import { ownBookingsWhere } from "./account-booking-rules";
import { ORDER_ROW_SELECT, ownOrdersWhere } from "./account-orders.service";
import type { CustomerContext } from "./customer-context.decorator";
import type {
    AccountChange,
    AccountCourse,
    AccountInvoiceDue,
    AccountNotices,
    AccountWaitlistPlace,
} from "./customer-view";
import {
    bookingChangeView,
    courseView,
    invoiceChangeView,
    invoiceDueView,
    latestChanges,
    messagesChangeView,
    noticesView,
    orderChangeView,
    orderView,
    waitlistPlaceView,
} from "./customer-view";

/**
 * The reads behind "all their details" in the customer's account (DEC-142;
 * ADR-011): invoices still to pay, places in a class's line, courses,
 * whether the business may email them, and what changed since they were
 * last here. Each is scoped to the signed-in customer's business **and**
 * contact, runs in that business's RLS context, and leaves through
 * `customer-view.ts`. Home and the tabs read the same functions, so the two
 * never disagree.
 */

type Ctx = Pick<CustomerContext, "organizationId" | "contactId" | "accountId">;

/** How many open invoices the account lists, the oldest due first. */
export const INVOICE_DUE_ROWS = 20;
/** One account holds at most ten places in line (A12). */
export const WAITLIST_ROWS = 10;
export const COURSE_ROWS = 10;
/** How far back each kind of change is looked for. */
const CHANGE_SCAN = 20;

// ---- Invoices to pay --------------------------------------------------------

/**
 * The customer's own open paper: issued, unpaid, billed to them, and the
 * business's own (never an order's, whose pay link is the order's, and
 * never a credit note) — the rule a pay link is made by
 * (`subscriptions/member-invoices.ts`).
 */
export function invoicesDueWhere(
    ctx: Pick<Ctx, "organizationId" | "contactId">,
): Prisma.InvoiceWhereInput {
    return {
        organizationId: ctx.organizationId,
        contactId: ctx.contactId,
        status: "ISSUED",
        number: { not: null },
        orderId: null,
        kind: { not: "CREDIT_NOTE" },
    };
}

/** Open invoices, the one due soonest first, with how each can be paid now. */
export async function readInvoicesDue(
    ctx: Ctx,
    now: Date,
): Promise<AccountInvoiceDue[]> {
    const rows = await prisma.invoice.findMany({
        where: invoicesDueWhere(ctx),
        orderBy: [{ dueAt: "asc" }, { issuedAt: "asc" }, { id: "asc" }],
        take: INVOICE_DUE_ROWS,
        select: {
            id: true,
            number: true,
            status: true,
            issuedAt: true,
            dueAt: true,
            total: true,
            currency: true,
            // Whether it is a bill of supply (D15); only that leaves.
            kind: true,
            sellerGstin: true,
            lines: {
                orderBy: { position: "asc" },
                select: {
                    description: true,
                    gstRate: true,
                    // The GST in a one-line paper's total, as it froze it.
                    amount: true,
                    taxableValue: true,
                    cgst: true,
                    sgst: true,
                    igst: true,
                    gstPriceMode: true,
                },
            },
        },
    });
    if (rows.length === 0) return [];
    const [online, charging] = await Promise.all([
        takesPaymentOnline(prisma, ctx.organizationId),
        // One charge at a time (D13): no link while autopay is charging it.
        chargesUnderWay(
            prisma,
            ctx.organizationId,
            rows.map((r) => r.id),
        ),
    ]);
    return rows.map((row) =>
        invoiceDueView(
            row,
            charging.has(row.id) ? "charging" : online ? "online" : "direct",
            now,
        ),
    );
}

// ---- A class's line ---------------------------------------------------------

/**
 * Where the customer is waiting for a place: classes still to come, in
 * line or with a place held for them while the offer lasts — the booking
 * page's own rule (`bookings/waitlist.service.ts` `mine`), across every
 * class rather than one service's.
 */
export async function readWaitlist(
    ctx: Ctx,
    now: Date,
): Promise<AccountWaitlistPlace[]> {
    const { organizationId, contactId } = ctx;
    const rows = await prisma.classWaitlistEntry.findMany({
        where: {
            organizationId,
            contactId,
            startAt: { gt: now },
            OR: [
                { status: "WAITING" },
                { status: "OFFERED", offeredUntil: { gt: now } },
            ],
        },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        take: WAITLIST_ROWS,
        select: {
            serviceId: true,
            startAt: true,
            status: true,
            position: true,
            offeredUntil: true,
            service: { select: { id: true, name: true } },
        },
    });
    if (rows.length === 0) return [];
    const timezone = await businessTimezone(prisma, organizationId);
    return Promise.all(
        rows.map(async (row) => {
            // Only a number leaves: how many are ahead, never who.
            const ahead =
                row.status === "OFFERED"
                    ? 0
                    : await prisma.classWaitlistEntry.count({
                          where: {
                              organizationId,
                              serviceId: row.serviceId,
                              startAt: row.startAt,
                              status: "WAITING",
                              position: { lt: row.position },
                          },
                      });
            return waitlistPlaceView(row, ahead, timezone, now);
        }),
    );
}

// ---- Courses ----------------------------------------------------------------

/** The courses the customer holds a seat on, newest first. Read-only. */
export async function readCourses(
    ctx: Ctx,
    now: Date,
): Promise<AccountCourse[]> {
    const { organizationId, contactId } = ctx;
    const rows = await prisma.courseEnrollment.findMany({
        where: { organizationId, contactId, status: "ACTIVE" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: COURSE_ROWS,
        select: {
            id: true,
            course: {
                select: {
                    name: true,
                    sessions: {
                        orderBy: { startAt: "asc" },
                        select: { startAt: true },
                    },
                },
            },
            // The seat's own sessions: when, whether it stands, how it went.
            bookings: {
                where: { organizationId, contactId },
                select: { startAt: true, status: true, outcome: true },
            },
        },
    });
    if (rows.length === 0) return [];
    const timezone = await businessTimezone(prisma, organizationId);
    return rows.map((row) => courseView(row, timezone, now));
}

// ---- Whether the business may email them ------------------------------------

/** Where a consent the customer set themselves says it came from. */
export const ACCOUNT_CONSENT_SOURCE = "site-account";

export async function readNotices(ctx: Ctx): Promise<AccountNotices> {
    const consent = await prisma.consent.findFirst({
        where: {
            organizationId: ctx.organizationId,
            contactId: ctx.contactId,
            channel: "EMAIL",
        },
        select: { status: true },
    });
    return noticesView(consent);
}

/**
 * The customer says whether the business may email them: the one consent
 * row every send already checks, for their own contact only. No new kind
 * of consent.
 */
export async function writeNotices(
    ctx: Ctx,
    email: boolean,
): Promise<AccountNotices> {
    const status = email ? "GRANTED" : "REVOKED";
    const consent = await prisma.consent.upsert({
        where: {
            contactId_channel: { contactId: ctx.contactId, channel: "EMAIL" },
        },
        create: {
            organizationId: ctx.organizationId,
            contactId: ctx.contactId,
            channel: "EMAIL",
            status,
            source: ACCOUNT_CONSENT_SOURCE,
        },
        update: { status, source: ACCOUNT_CONSENT_SOURCE },
        select: { status: true },
    });
    return noticesView(consent);
}

// ---- A first sign-in that staff haven't linked yet ---------------------------

/**
 * Whether this account stands on a separate contact because another
 * contact already held its email unverified (DEC-049): the contact's own
 * email is then the reserved placeholder. Until staff merge the pair
 * (DEC-055), earlier orders and bookings aren't on the account, and an
 * empty Home says so rather than "nothing yet".
 */
export async function readLinkPending(ctx: Ctx): Promise<boolean> {
    const contact = await prisma.contact.findFirst({
        where: { id: ctx.contactId, organizationId: ctx.organizationId },
        select: { email: true },
    });
    return isReservedContactEmail(contact?.email);
}

// ---- What changed since they were last here ----------------------------------

/**
 * What happened to the customer's own record after `since`, newest first:
 * an order the business moved a step or cancelled, a booking the business
 * moved or cancelled, messages the team wrote that they haven't opened,
 * and an invoice issued to them that is still to pay. Everything is read
 * from what is already stored (order and booking events, the thread, the
 * invoice's issue date). Nothing with no `since`: a first visit has
 * nothing to compare with.
 *
 * What the customer did themselves is left out — their own move or cancel
 * carries no staff actor — and Saroh's own notices in the thread are left
 * out too, since each repeats an order or booking line here.
 */
export async function readChanges(
    ctx: Ctx,
    since: Date | null,
): Promise<AccountChange[]> {
    if (!since) return [];
    const { organizationId, contactId } = ctx;
    const [orderEvents, bookingEvents, thread, invoices] = await Promise.all([
        prisma.orderEvent.findMany({
            where: {
                organizationId,
                createdAt: { gt: since },
                undoneAt: null,
                OR: [
                    { kind: "STAGE" },
                    {
                        kind: "STATUS",
                        toStatus: "CANCELLED",
                        actorUserId: { not: null },
                    },
                ],
                order: await ownOrdersWhere(ctx),
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: CHANGE_SCAN,
            select: {
                createdAt: true,
                order: { select: ORDER_ROW_SELECT },
            },
        }),
        prisma.bookingEvent.findMany({
            where: {
                organizationId,
                createdAt: { gt: since },
                type: { in: ["RESCHEDULED", "CANCELLED"] },
                // A team member did it: the customer's own carry no actor.
                actorUserId: { not: null },
                booking: ownBookingsWhere(ctx),
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: CHANGE_SCAN,
            select: {
                type: true,
                createdAt: true,
                fromStartAt: true,
                booking: {
                    select: {
                        id: true,
                        startAt: true,
                        timezone: true,
                        status: true,
                        service: { select: { name: true } },
                    },
                },
            },
        }),
        prisma.customerThread.findUnique({
            where: { contactId_organizationId: { contactId, organizationId } },
            select: { id: true, customerReadAt: true },
        }),
        prisma.invoice.findMany({
            where: { ...invoicesDueWhere(ctx), issuedAt: { gt: since } },
            orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
            take: CHANGE_SCAN,
            select: {
                id: true,
                number: true,
                total: true,
                currency: true,
                issuedAt: true,
                createdAt: true,
            },
        }),
    ]);

    const changes: AccountChange[] = [];

    // An order's newest step says where it is now; older steps are history.
    const orders = new Set<string>();
    for (const event of orderEvents) {
        if (orders.has(event.order.id)) continue;
        orders.add(event.order.id);
        const order = orderView(event.order);
        changes.push(
            orderChangeView({
                orderRef: order.ref,
                number: order.number,
                status: order.status,
                at: event.createdAt,
            }),
        );
    }

    const bookings = new Set<string>();
    for (const event of bookingEvents) {
        if (bookings.has(event.booking.id)) continue;
        bookings.add(event.booking.id);
        // Only what still holds: a booking moved and then cancelled by the
        // customer is not "moved", and one booked again is not "cancelled".
        const cancelled = event.booking.status === "CANCELLED";
        if ((event.type === "CANCELLED") !== cancelled) continue;
        changes.push(
            bookingChangeView({
                type: event.type,
                at: event.createdAt,
                fromStartAt: event.fromStartAt,
                booking: event.booking,
            }),
        );
    }

    if (thread) {
        const after =
            thread.customerReadAt && thread.customerReadAt > since
                ? thread.customerReadAt
                : since;
        const written = await prisma.customerThreadMessage.aggregate({
            where: {
                organizationId,
                threadId: thread.id,
                author: "STAFF",
                createdAt: { gt: after },
            },
            _count: { _all: true },
            _max: { createdAt: true },
        });
        if (written._count._all > 0 && written._max.createdAt) {
            changes.push(
                messagesChangeView(written._count._all, written._max.createdAt),
            );
        }
    }

    for (const invoice of invoices) changes.push(invoiceChangeView(invoice));

    return latestChanges(changes);
}
