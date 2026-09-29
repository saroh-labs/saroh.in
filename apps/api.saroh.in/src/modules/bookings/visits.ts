import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import type { Booking, OrderFulfilment, Service } from "@saroh/database";
import { nextOrderNumberInTx, Prisma, prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import { normaliseEmail } from "../customer-workspace/duplicates";
import { rateToBps } from "../invoices/gst";
import { gstInsideOrder } from "../invoices/order-invoice";
import { loadTaxProfile } from "../invoices/order-invoicing";
import { fromCents } from "../orders/order-pricing";
import { commerceOpen, effectiveStorefront } from "../sites/sells-from";
import { storefrontCurrency } from "../stores/currency";
import { isValidSlotStart } from "./availability";
import {
    loadStaffing,
    refuseIfClosed,
    resolvePerson,
    toAvailabilityService,
} from "./booking-slots";
import type { BookInput, SignedInBooker } from "./reservation";
import { loadBookableService, reserveInTx } from "./reservation";

/*
 * Visits (E9, DEC-050, default 40): a service of more than one visit is a
 * treatment. Booking it sells the whole treatment once, as one order of
 * type Appointment whose one line bills the Service, and books visit 1.
 * Later visits are bookings linked to the same order (`Booking.orderId`,
 * `visitNumber`), never invoiced on their own.
 *
 * - The order goes to the storefront the service's booking site sells from
 *   (G11), else the business's oldest open storefront. With none — or with
 *   Commerce switched off, where its orders live — a treatment can't be
 *   booked, and the refusal comes before any hold is made.
 * - Its store customer is found at that storefront by the booking's email,
 *   or made, and linked to the booking's contact — all in the booking's
 *   transaction.
 * - A visit never refunds on its own: cancelling it frees its slot and
 *   leaves the order. Money comes back only through the order's refund
 *   (B9, `payment:manage`).
 */

type Tx = Prisma.TransactionClient;

/** Why a treatment can't be booked on the booking page (no storefront). */
export const TREATMENT_NOT_ONLINE =
    "This treatment can't be booked online yet.";

/** Why a treatment needs an email: its bill goes to one. */
export const TREATMENT_NEEDS_EMAIL =
    "A treatment's bill goes to an email. Add theirs first.";

/** What a cancel of a visit says about money (E8, DEC-051). */
export const TREATMENT_REFUNDED_FROM_ORDER =
    "Money for this treatment is refunded from its order.";

/** A service of more than one visit is a treatment, sold as one order. */
export function isTreatment(service: Pick<Service, "visits">): boolean {
    return service.visits > 1;
}

/**
 * The storefront a treatment's order goes to: the one the service's booking
 * site sells from, while it is open, else the business's oldest open
 * storefront. Null when the business has none.
 */
export async function treatmentStorefront(
    db: Pick<Tx, "store" | "site" | "organizationModule">,
    service: Pick<Service, "organizationId" | "siteId">,
): Promise<{ id: string } | null> {
    // Its order lives in Commerce: switched off, there is nowhere to sell
    // it that the business can see (DEC-057).
    if (!(await commerceOpen(db, service.organizationId))) return null;
    if (service.siteId) {
        const site = await db.site.findFirst({
            where: {
                id: service.siteId,
                organizationId: service.organizationId,
            },
            select: { organizationId: true, storefrontId: true },
        });
        const sellsFrom = site ? await effectiveStorefront(db, site) : null;
        if (sellsFrom) return { id: sellsFrom.id };
    }
    return db.store.findFirst({
        where: { organizationId: service.organizationId, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
    });
}

/**
 * The treatment's storefront, or the booking page's refusal. Asked before
 * anything is held.
 */
export async function requireTreatmentStorefront(
    service: Pick<Service, "organizationId" | "siteId">,
): Promise<{ id: string }> {
    const store = await treatmentStorefront(prisma, service);
    if (!store) {
        throw new ConflictException({
            message: TREATMENT_NOT_ONLINE,
            details: { reason: "no-storefront" },
        });
    }
    return store;
}

/** Why a service of more than one visit can't be saved (E10). */
export const TREATMENT_NEEDS_STOREFRONT =
    "Treatments are sold as orders — add a storefront first.";

/**
 * The Service Editor's rule (E10): a service of more than one visit is a
 * treatment, sold as an order, so it needs a storefront to sell from, and
 * it is one-to-one (a class is booked a session at a time). Asked when a
 * service is made a treatment — created with visits, or raised from one —
 * so a service that already is one still saves when its storefront is
 * closed later; the booking page refuses it then (E9).
 */
export async function assertTreatmentSellable(
    service: Pick<Service, "organizationId" | "siteId">,
    input: { visits: number; capacity: number; wasTreatment: boolean },
): Promise<void> {
    if (input.visits <= 1) return;
    if (input.capacity > 1) {
        throw new BadRequestException({
            message:
                "Visits are for one-to-one services. A class is booked a session at a time.",
            details: { field: "visits" },
        });
    }
    if (input.wasTreatment) return;
    if (!(await treatmentStorefront(prisma, service))) {
        throw new ConflictException({
            message: TREATMENT_NEEDS_STOREFRONT,
            details: { reason: "no-storefront", field: "visits" },
        });
    }
}

/** The email a treatment's bill goes to, or the refusal that asks for one. */
export function treatmentEmail(email: string | null | undefined): string {
    const normalised = normaliseEmail(email);
    if (!normalised) {
        throw new BadRequestException({
            message: TREATMENT_NEEDS_EMAIL,
            field: "bookerEmail",
        });
    }
    return normalised;
}

/** Where a treatment's visits happen: online or in person. */
function appointmentType(
    booking: Pick<Booking, "locationType">,
    service: Pick<Service, "locationType">,
): OrderFulfilment {
    return (booking.locationType ?? service.locationType) === "ONLINE"
        ? "APPOINTMENT_ONLINE"
        : "APPOINTMENT_IN_PERSON";
}

/**
 * The store customer at the storefront with this email, made if none, and
 * linked to the booking's contact (DEC-050). A customer already linked to
 * someone else is left as it is: a link is never moved or doubled up on
 * an email alone.
 */
async function treatmentCustomerInTx(
    tx: Tx,
    input: {
        organizationId: string;
        storeId: string;
        email: string;
        booking: Pick<
            Booking,
            "contactId" | "bookerName" | "bookerPhone" | "customerAccountId"
        >;
    },
): Promise<string> {
    const { organizationId, storeId, email, booking } = input;
    const found = await tx.customer.findFirst({
        where: { storeId, email: { equals: email, mode: "insensitive" } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
    });
    const words = (booking.bookerName ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    const first = words.length > 0 ? words[0] : null;
    const rest = words.slice(1);
    const customerId =
        found?.id ??
        (
            await tx.customer.create({
                data: {
                    storeId,
                    organizationId,
                    email,
                    firstName: first ?? null,
                    lastName: rest.length > 0 ? rest.join(" ") : null,
                    phone: booking.bookerPhone ?? null,
                },
                select: { id: true },
            })
        ).id;
    if (booking.contactId) {
        const links = await tx.customerIdentityLink.findMany({
            where: { customerId },
            select: { contactId: true },
        });
        if (links.length === 0) {
            await tx.customerIdentityLink.create({
                data: {
                    organizationId,
                    contactId: booking.contactId,
                    customerId,
                    reason: "BOOKING",
                },
                select: { id: true },
            });
        }
    }
    return customerId;
}

/**
 * Sell a treatment on the booking's transaction: one order at the
 * storefront, one service line for the whole treatment (quantity 1, the
 * service's price, no stock), and the booking made its visit 1. The price
 * includes GST at the service's rate for a registered business, as a
 * product's does (ADR-008). Nothing is invoiced here: the booking's pay-now
 * invoice (or the order's, when it is paid) bills it.
 */
export async function startTreatmentInTx(
    tx: Tx,
    input: { service: Service; booking: Booking; storeId: string },
): Promise<{ orderId: string; orderItemId: string; orderNumber: string }> {
    const { service, booking, storeId } = input;
    const organizationId = service.organizationId;
    const email = treatmentEmail(booking.bookerEmail);
    const customerId = await treatmentCustomerInTx(tx, {
        organizationId,
        storeId,
        email,
        booking,
    });
    const priceCents = service.priceCents ?? 0;
    const currency =
        service.currency ?? (await storefrontCurrency(tx, storeId)) ?? "INR";
    const profile = await loadTaxProfile(tx, organizationId);
    const taxCents = profile.registered
        ? gstInsideOrder(
              [
                  {
                      quantity: 1,
                      unitCents: priceCents,
                      rateBps: rateToBps(service.gstRate?.toString() ?? null),
                  },
              ],
              {
                  shippingCents: 0,
                  discountCents: 0,
                  deliveryState: null,
                  profile,
              },
          )
        : 0;
    // The business's next number, as every order's (P3, DEC-066).
    const orderNumber = await nextOrderNumberInTx(tx, organizationId);
    const order = await tx.order.create({
        data: {
            storeId,
            organizationId,
            orderId: orderNumber,
            customerId,
            currency,
            subtotal: fromCents(priceCents),
            tax: fromCents(taxCents),
            total: fromCents(priceCents),
            fulfilment: appointmentType(booking, service),
            // Booked signed in: the account's Orders find it by this (A7).
            customerAccountId: booking.customerAccountId,
            items: {
                create: {
                    serviceId: service.id,
                    quantity: 1,
                    price: fromCents(priceCents),
                    // A service line holds no stock, for life.
                    stockRow: "NONE",
                },
            },
        },
        select: { id: true, items: { select: { id: true } } },
    });
    await tx.booking.update({
        where: { id: booking.id },
        data: { orderId: order.id, visitNumber: 1 },
        select: { id: true },
    });
    const orderItemId = order.items[0]?.id ?? "";
    return { orderId: order.id, orderItemId, orderNumber };
}

/** What {@link bookVisit} takes: which visit, when, and with whom. */
export interface BookVisitInput {
    visitNumber: number;
    startAt: string;
    staffId?: string;
}

/**
 * Book visit `n` of a treatment (`booking:write`): under the same capacity
 * rules as any booking, in one serializable transaction, taking the order's
 * lock before the booking's (the documented order). Refused past the
 * treatment's visits, before the previous visit is booked, and when this
 * visit already is. Another business's order is a 404. Never invoiced: the
 * treatment was sold once, on its order.
 */
export async function bookVisit(
    ctx: Pick<OrganizationContext, "organizationId"> & {
        userId: string | null;
    },
    orderId: string,
    dto: BookVisitInput,
    /**
     * The customer booking it themselves from their account (A6): the
     * booking goes on their account's contact, names the account, and a
     * time they can't have reads as gone rather than why.
     */
    customer?: SignedInBooker,
): Promise<Booking> {
    const n = dto.visitNumber;
    const order = await prisma.order.findFirst({
        where: { id: orderId, organizationId: ctx.organizationId },
        select: {
            id: true,
            status: true,
            paymentStatus: true,
            items: {
                where: { serviceId: { not: null } },
                select: { serviceId: true },
            },
            bookings: {
                orderBy: [{ visitNumber: "asc" }, { createdAt: "asc" }],
                select: {
                    visitNumber: true,
                    status: true,
                    bookerEmail: true,
                    bookerName: true,
                    bookerPhone: true,
                    locationType: true,
                },
            },
        },
    });
    if (!order) throw new NotFoundException("Order not found");
    const serviceId = order.items[0]?.serviceId;
    if (!serviceId) {
        throw new ConflictException("This order isn't a treatment.");
    }
    refuseClosedTreatment(order);
    const { service, rules } = await loadBookableService(serviceId);
    if (service.organizationId !== ctx.organizationId) {
        throw new NotFoundException("Order not found");
    }
    const live = new Set(
        order.bookings
            .filter((b) => b.status !== "CANCELLED")
            .map((b) => b.visitNumber),
    );
    assertVisitBookable(n, service.visits, live);

    const startAt = new Date(dto.startAt);
    if (Number.isNaN(startAt.getTime())) {
        throw new BadRequestException("startAt is not a valid instant");
    }
    const endAt = new Date(
        startAt.getTime() + service.durationMinutes * 60_000,
    );
    await refuseIfClosed(ctx.organizationId, startAt, endAt);
    const staffing = await loadStaffing(service);
    if (
        !staffing.perPerson &&
        !isValidSlotStart(toAvailabilityService(service), rules, startAt)
    ) {
        throw new BadRequestException(
            "That time is not an open slot for this service",
        );
    }
    const person = await resolvePerson(
        service,
        rules,
        staffing,
        startAt,
        dto.staffId,
        customer ? "public" : "team",
    );
    // The treatment's customer, as its first visit was booked.
    const first = order.bookings.length > 0 ? order.bookings[0] : null;
    const booker: BookInput = {
        startAt: dto.startAt,
        bookerEmail: treatmentEmail(first?.bookerEmail),
        bookerName: first?.bookerName ?? undefined,
        bookerPhone: first?.bookerPhone ?? undefined,
        locationType:
            service.locationType === "EITHER"
                ? ((first?.locationType as "IN_PERSON" | "ONLINE" | null) ??
                  undefined)
                : undefined,
    };

    try {
        return await prisma.$transaction(
            async (tx) => {
                // The order as it stands under its lock: a cancel or a full
                // refund that landed since it was read ends the treatment.
                const [locked] = await tx.$queryRaw<
                    { status: string; paymentStatus: string }[]
                >`SELECT status::text AS status, "paymentStatus"::text AS "paymentStatus"
                  FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
                refuseClosedTreatment(locked);
                const again = await tx.booking.findMany({
                    where: { orderId: order.id, status: { not: "CANCELLED" } },
                    select: { visitNumber: true },
                });
                assertVisitBookable(
                    n,
                    service.visits,
                    new Set(again.map((b) => b.visitNumber)),
                );
                return reserveInTx(
                    tx,
                    service,
                    startAt,
                    endAt,
                    booker,
                    customer
                        ? {
                              source: `booking:service:${service.id}`,
                              actorUserId: null,
                              account: customer,
                          }
                        : { source: "manual", actorUserId: ctx.userId },
                    undefined,
                    {
                        ...person,
                        // Paid for on the order, never on the visit.
                        paidWith: null,
                        visit: { orderId: order.id, visitNumber: n },
                    },
                );
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    } catch (err) {
        const code = prismaErrorCode(err);
        if (code === "P2002" || code === "P2034") {
            const taken = await prisma.booking.count({
                where: {
                    orderId: order.id,
                    visitNumber: n,
                    status: { not: "CANCELLED" },
                },
            });
            throw new ConflictException(
                taken > 0
                    ? `Visit ${n} is already booked.`
                    : "That slot is fully booked",
            );
        }
        throw err;
    }
}

/**
 * A treatment whose order was cancelled, or refunded in full, books no more
 * visits. Checked on the order as read, and again under its lock.
 */
export function refuseClosedTreatment(
    order: { status: string; paymentStatus: string } | undefined,
): void {
    if (!order) throw new NotFoundException("Order not found");
    if (order.status === "CANCELLED") {
        throw new ConflictException(
            "This treatment's order was cancelled, so no more visits can be booked.",
        );
    }
    if (order.paymentStatus === "REFUNDED") {
        throw new ConflictException(
            "This treatment was refunded, so no more visits can be booked.",
        );
    }
}

/**
 * Whether visit `n` of `visits` can be booked, given the visits booked now:
 * refused past the last visit, before the one before it, and when it
 * already is.
 */
export function assertVisitBookable(
    n: number,
    visits: number,
    booked: ReadonlySet<number | null>,
): void {
    if (!Number.isInteger(n) || n < 1) {
        throw new BadRequestException({
            message: "Choose which visit to book.",
            field: "visitNumber",
        });
    }
    if (n > visits) {
        const all = Array.from({ length: visits }, (_, i) => i + 1).every((v) =>
            booked.has(v),
        );
        throw new ConflictException(
            all
                ? `All ${visits} visits are booked.`
                : `This treatment has ${visits} visits.`,
        );
    }
    if (booked.has(n)) {
        throw new ConflictException(`Visit ${n} is already booked.`);
    }
    if (n > 1 && !booked.has(n - 1)) {
        throw new ConflictException(`Book visit ${n - 1} first.`);
    }
}

/** Where a treatment stands: its visits, and how many are booked and attended. */
export interface TreatmentProgress {
    visits: number;
    booked: number;
    attended: number;
    /** Every visit attended: the treatment is done. */
    done: boolean;
}

/**
 * The hook B14 needs: where a treatment's visits stand, read on the
 * caller's transaction. When `done`, its last visit was attended, and the
 * order is delivered. Null for an order that isn't a treatment.
 */
export async function treatmentProgressInTx(
    db: Pick<Tx, "order">,
    orderId: string,
): Promise<TreatmentProgress | null> {
    const order = await db.order.findUnique({
        where: { id: orderId },
        select: {
            items: {
                where: { serviceId: { not: null } },
                select: { service: { select: { visits: true } } },
            },
            bookings: {
                where: { status: { not: "CANCELLED" } },
                select: { visitNumber: true, outcome: true },
            },
        },
    });
    const visits = order?.items[0]?.service?.visits;
    if (!order || !visits) return null;
    const booked = new Set(order.bookings.map((b) => b.visitNumber)).size;
    const attended = new Set(
        order.bookings
            .filter((b) => b.outcome === "ATTENDED")
            .map((b) => b.visitNumber),
    ).size;
    return { visits, booked, attended, done: attended >= visits };
}
