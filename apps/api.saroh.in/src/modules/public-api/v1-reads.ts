import type {
    BookingView,
    CustomerView,
    EnquiryView,
    FormEntryView,
    OrderView,
    PageQuery,
    PostView,
    ProductView,
    ServiceView,
    SubscriptionPlanView,
} from "@saroh/api-contract";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { readableAnswers } from "../forms/enquiry-entries";
import { orderLocationWhere } from "../orders/order-location";
import {
    bookingOutcome,
    bookingStatus,
    enquiryStatus,
    orderFulfilment,
    orderStage,
    orderStatus,
    paymentStatus,
    planInterval,
    planStatus,
    postStatus,
    productStatus,
    serviceStatus,
} from "./v1-enums";
import { afterCursor, iso, NEWEST_FIRST, pageOf, toMoney } from "./v1-support";

/**
 * The `/v1` reads (plan 2026-11-10-001, U8): one shape per record, newest
 * first, keyset-paged, always within the key's business. Every answer is an
 * explicit list of fields, so a column added later is never published by
 * accident, and nothing `customer:sensitive` (needs attention, notes, a
 * booking's intake note) is ever selected.
 */

/** The app clears a text field to ""; the API answers a cleared field as null. */
const orNull = (value: string | null) => (value === "" ? null : value);

type Paging = Pick<PageQuery, "cursor" | "limit">;
const paged = (q: Paging) => ({
    orderBy: NEWEST_FIRST,
    take: q.limit + 1,
});

// ── Products ────────────────────────────────────────────────────────────────

const PRODUCT = {
    id: true,
    name: true,
    slug: true,
    description: true,
    status: true,
    price: true,
    currency: true,
    createdAt: true,
    updatedAt: true,
    variants: {
        orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
        select: { id: true, sku: true, title: true, price: true },
    },
};
interface ProductRow {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    status: string;
    price: { toString(): string };
    currency: string;
    createdAt: Date;
    updatedAt: Date;
    variants: {
        id: string;
        sku: string;
        title: string;
        price: { toString(): string } | null;
    }[];
}

const productView = (p: ProductRow): ProductView => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    status: productStatus.out(p.status),
    price: toMoney(p.price, p.currency),
    variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        title: v.title,
        price: v.price === null ? null : toMoney(v.price, p.currency),
    })),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
});

/** `query`: words in the name (the MCP's `list_products`). */
export async function productsPage(
    organizationId: string,
    q: Paging & { query?: string },
) {
    const rows = await prisma.product.findMany({
        where: {
            organizationId,
            ...(q.query
                ? { name: { contains: q.query, mode: "insensitive" as const } }
                : {}),
            ...afterCursor(q.cursor),
        },
        ...paged(q),
        select: PRODUCT,
    });
    return pageOf(rows, q.limit, productView);
}

export async function productById(organizationId: string, id: string) {
    const row = await prisma.product.findFirst({
        where: { id, organizationId },
        select: PRODUCT,
    });
    return row ? productView(row) : null;
}

/** A variant of the business's product, its prices as the DTOs' decimal text. */
export async function variantOf(
    organizationId: string,
    productId: string,
    id: string,
): Promise<{
    sku: string;
    title: string;
    price: string | null;
    mrp: string | null;
} | null> {
    const v = await prisma.productVariant.findFirst({
        where: { id, productId, product: { organizationId } },
        select: { sku: true, title: true, price: true, mrp: true },
    });
    return v
        ? {
              sku: v.sku,
              title: v.title,
              price: v.price === null ? null : v.price.toFixed(2),
              mrp: v.mrp === null ? null : v.mrp.toFixed(2),
          }
        : null;
}

/** The business's only storefront, for a write that names none; null when it has several or none. */
export async function onlyStorefront(organizationId: string) {
    const stores = await prisma.store.findMany({
        where: { organizationId, deletedAt: null },
        take: 2,
        select: { id: true },
    });
    return stores.length === 1 ? (stores[0]?.id ?? null) : null;
}

/** A storefront of this business, or null. */
export async function storefrontOf(organizationId: string, id: string) {
    const store = await prisma.store.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true },
    });
    return store?.id ?? null;
}

// ── Services, posts, plans ──────────────────────────────────────────────────

/** The time zone the business set, for a service made without one. */
export async function businessTimezone(organizationId: string) {
    const profile = await prisma.businessProfile.findUnique({
        where: { organizationId },
        select: { timezone: true },
    });
    return profile?.timezone ?? null;
}

const SERVICE = {
    id: true,
    name: true,
    description: true,
    durationMinutes: true,
    bufferBeforeMinutes: true,
    bufferAfterMinutes: true,
    capacity: true,
    priceCents: true,
    currency: true,
    timezone: true,
    status: true,
    createdAt: true,
    updatedAt: true,
} as const;

interface ServiceRow {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    capacity: number;
    priceCents: number | null;
    currency: string | null;
    timezone: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}

const serviceView = (s: ServiceRow): ServiceView => ({
    id: s.id,
    name: s.name,
    description: orNull(s.description),
    durationMinutes: s.durationMinutes,
    bufferBeforeMinutes: s.bufferBeforeMinutes,
    bufferAfterMinutes: s.bufferAfterMinutes,
    capacity: s.capacity,
    price:
        s.priceCents === null || !s.currency
            ? null
            : { amountMinor: s.priceCents, currency: s.currency },
    timezone: s.timezone,
    status: serviceStatus.out(s.status),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
});

export async function servicesPage(organizationId: string, q: Paging) {
    const rows = await prisma.service.findMany({
        where: { organizationId, deletedAt: null, ...afterCursor(q.cursor) },
        ...paged(q),
        select: SERVICE,
    });
    return pageOf(rows, q.limit, serviceView);
}

export async function serviceById(organizationId: string, id: string) {
    const row = await prisma.service.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: SERVICE,
    });
    return row ? serviceView(row) : null;
}

export async function postsPage(organizationId: string, q: Paging) {
    const rows = await prisma.post.findMany({
        where: { site: { organizationId }, ...afterCursor(q.cursor) },
        ...paged(q),
        select: {
            id: true,
            siteId: true,
            title: true,
            slug: true,
            excerpt: true,
            status: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
        },
    });
    return pageOf(rows, q.limit, (p): PostView => ({
        ...p,
        status: postStatus.out(p.status),
        publishedAt: iso(p.publishedAt),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    }));
}

export async function plansPage(organizationId: string, q: Paging) {
    const rows = await prisma.subscriptionPlan.findMany({
        where: { organizationId, ...afterCursor(q.cursor) },
        ...paged(q),
        select: {
            id: true,
            name: true,
            description: true,
            price: true,
            currency: true,
            interval: true,
            status: true,
            classesPerMonth: true,
            createdAt: true,
        },
    });
    return pageOf(
        rows,
        q.limit,
        ({ price, currency, ...p }): SubscriptionPlanView => ({
            ...p,
            interval: planInterval.out(p.interval),
            status: planStatus.out(p.status),
            price: toMoney(price, currency),
            createdAt: p.createdAt.toISOString(),
        }),
    );
}

// ── Bookings ────────────────────────────────────────────────────────────────

// Never `intakeNote`: a booking's note is sensitive (E7).
const BOOKING = {
    id: true,
    serviceId: true,
    contactId: true,
    staffId: true,
    status: true,
    startAt: true,
    endAt: true,
    timezone: true,
    bookerName: true,
    bookerEmail: true,
    bookerPhone: true,
    outcome: true,
    cancelledAt: true,
    createdAt: true,
} as const;

interface BookingRow {
    id: string;
    serviceId: string;
    contactId: string | null;
    staffId: string | null;
    status: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    bookerName: string | null;
    bookerEmail: string | null;
    bookerPhone: string | null;
    outcome: string | null;
    cancelledAt: Date | null;
    createdAt: Date;
}

export const bookingView = (b: BookingRow): BookingView => ({
    id: b.id,
    serviceId: b.serviceId,
    contactId: b.contactId,
    staffId: b.staffId,
    status: bookingStatus.out(b.status),
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    timezone: b.timezone,
    booker: { name: b.bookerName, email: b.bookerEmail, phone: b.bookerPhone },
    outcome: b.outcome === null ? null : bookingOutcome.out(b.outcome),
    cancelledAt: iso(b.cancelledAt),
    createdAt: b.createdAt.toISOString(),
});

/** `contactId`, `from` and `to` (on the start) are the MCP's `list_bookings`. */
export async function bookingsPage(
    organizationId: string,
    q: Paging & {
        status?: BookingView["status"];
        serviceId?: string;
        contactId?: string;
        from?: Date;
        to?: Date;
    },
) {
    const rows = await prisma.booking.findMany({
        where: {
            organizationId,
            ...(q.status ? { status: bookingStatus.in(q.status) } : {}),
            ...(q.serviceId ? { serviceId: q.serviceId } : {}),
            ...(q.contactId ? { contactId: q.contactId } : {}),
            ...(q.from || q.to
                ? {
                      startAt: {
                          ...(q.from ? { gte: q.from } : {}),
                          ...(q.to ? { lt: q.to } : {}),
                      },
                  }
                : {}),
            ...afterCursor(q.cursor),
        },
        ...paged(q),
        select: BOOKING,
    });
    return pageOf(rows, q.limit, bookingView);
}

export async function bookingById(organizationId: string, id: string) {
    const row = await prisma.booking.findFirst({
        where: { id, organizationId },
        select: BOOKING,
    });
    return row ? bookingView(row) : null;
}

// ── Orders ──────────────────────────────────────────────────────────────────

const ORDER = {
    id: true,
    orderId: true,
    storeId: true,
    customerId: true,
    status: true,
    paymentStatus: true,
    stage: true,
    fulfilment: true,
    subtotal: true,
    tax: true,
    shipping: true,
    discount: true,
    total: true,
    currency: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    items: {
        orderBy: { id: "asc" as const },
        select: {
            id: true,
            productId: true,
            variantId: true,
            quantity: true,
            price: true,
        },
    },
};

interface Amount {
    toString(): string;
}
interface OrderRow {
    id: string;
    orderId: string;
    storeId: string;
    customerId: string | null;
    status: string;
    paymentStatus: string;
    stage: string;
    fulfilment: string;
    subtotal: Amount;
    tax: Amount;
    shipping: Amount;
    discount: Amount;
    total: Amount;
    currency: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    items: {
        id: string;
        productId: string | null;
        variantId: string | null;
        quantity: number;
        price: Amount;
    }[];
}

const orderView = (o: OrderRow): OrderView => ({
    id: o.id,
    number: o.orderId,
    storefrontId: o.storeId,
    customerId: o.customerId,
    status: orderStatus.out(o.status),
    paymentStatus: paymentStatus.out(o.paymentStatus),
    stage: orderStage.out(o.stage),
    fulfilment: orderFulfilment.out(o.fulfilment),
    subtotal: toMoney(o.subtotal, o.currency),
    tax: toMoney(o.tax, o.currency),
    shipping: toMoney(o.shipping, o.currency),
    discount: toMoney(o.discount, o.currency),
    total: toMoney(o.total, o.currency),
    items: o.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        unitPrice: toMoney(i.price, o.currency),
    })),
    notes: o.notes,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
});

/** Who reads: a location's team reads its own storefronts' (DEC-074). */
type OrderViewer = Pick<OrganizationContext, "roleKey" | "userId">;

export async function ordersPage(
    organizationId: string,
    q: Paging & { status?: OrderView["status"] },
    viewer: OrderViewer,
) {
    const rows = await prisma.order.findMany({
        where: {
            organizationId,
            ...orderLocationWhere(viewer),
            ...(q.status ? { status: orderStatus.in(q.status) } : {}),
            ...afterCursor(q.cursor),
        },
        ...paged(q),
        select: ORDER,
    });
    return pageOf(rows, q.limit, orderView);
}

export async function orderById(
    organizationId: string,
    id: string,
    /** Absent for the system (a webhook's delivery), never for a person. */
    viewer?: OrderViewer,
) {
    const row = await prisma.order.findFirst({
        where: {
            id,
            organizationId,
            ...(viewer ? orderLocationWhere(viewer) : {}),
        },
        select: ORDER,
    });
    return row ? orderView(row) : null;
}

/** The storefront an order was taken at, for the storefront-scoped writes. */
export async function orderStorefront(organizationId: string, id: string) {
    const row = await prisma.order.findFirst({
        where: { id, organizationId },
        select: { storeId: true },
    });
    return row?.storeId ?? null;
}

// ── Customers ───────────────────────────────────────────────────────────────

// An allowlist: needs attention, notes and the rest of what is
// `customer:sensitive` live elsewhere and are never selected here.
const CUSTOMER = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    phone: true,
    company: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    state: true,
    postalCode: true,
    country: true,
    createdAt: true,
    updatedAt: true,
} as const;

interface CustomerRow {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    company: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const customerView = (c: CustomerRow): CustomerView => {
    const address = {
        line1: c.addressLine1,
        line2: c.addressLine2,
        city: c.city,
        state: c.state,
        postalCode: c.postalCode,
        country: c.country,
    };
    return {
        id: c.id,
        email: c.email,
        firstName: orNull(c.firstName),
        lastName: orNull(c.lastName),
        phone: orNull(c.phone),
        company: orNull(c.company),
        address: Object.values(address).some((v) => v !== null)
            ? address
            : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
    };
};

// A merged-away contact is a tombstone (DEC-042): never listed.
// `query`: part of a name, email, phone or company (the MCP's `list_customers`).
export async function customersPage(
    organizationId: string,
    q: Paging & { query?: string },
) {
    // Every word somewhere, so "Priya Shah" finds first name + last name.
    const words = (q.query ?? "").split(/\s+/).filter(Boolean).slice(0, 5);
    const rows = await prisma.contact.findMany({
        where: {
            organizationId,
            mergedIntoId: null,
            AND: words.map((word) => {
                const like = { contains: word, mode: "insensitive" as const };
                return {
                    OR: [
                        { firstName: like },
                        { lastName: like },
                        { email: like },
                        { phone: like },
                        { company: like },
                    ],
                };
            }),
            ...afterCursor(q.cursor),
        },
        ...paged(q),
        select: CUSTOMER,
    });
    return pageOf(rows, q.limit, customerView);
}

export async function customerById(organizationId: string, id: string) {
    const row = await prisma.contact.findFirst({
        where: { id, organizationId, mergedIntoId: null },
        select: CUSTOMER,
    });
    return row ? customerView(row) : null;
}

// ── Enquiries and form entries ──────────────────────────────────────────────

const ENQUIRY = {
    id: true,
    title: true,
    status: true,
    stage: { select: { id: true, name: true } },
    contactId: true,
    formId: true,
    createdAt: true,
    updatedAt: true,
} as const;

const enquiryView = (l: {
    id: string;
    title: string;
    status: string;
    stage: { id: string; name: string };
    contactId: string;
    formId: string | null;
    createdAt: Date;
    updatedAt: Date;
}): EnquiryView => ({
    id: l.id,
    title: l.title,
    status: enquiryStatus.out(l.status),
    stage: { id: l.stage.id, name: l.stage.name },
    customerId: l.contactId,
    formId: l.formId,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
});

export async function enquiriesPage(organizationId: string, q: Paging) {
    const rows = await prisma.lead.findMany({
        where: { organizationId, ...afterCursor(q.cursor) },
        ...paged(q),
        select: ENQUIRY,
    });
    return pageOf(rows, q.limit, enquiryView);
}

export async function enquiryById(organizationId: string, id: string) {
    const row = await prisma.lead.findFirst({
        where: { id, organizationId },
        select: ENQUIRY,
    });
    return row ? enquiryView(row) : null;
}

export async function formEntriesPage(
    organizationId: string,
    q: Paging & { formId?: string },
) {
    const rows = await prisma.submission.findMany({
        where: {
            organizationId,
            ...(q.formId ? { formId: q.formId } : {}),
            ...afterCursor(q.cursor),
        },
        ...paged(q),
        select: {
            id: true,
            formId: true,
            contactId: true,
            leadId: true,
            data: true,
            createdAt: true,
            form: { select: { name: true, fields: true } },
        },
    });
    return pageOf(rows, q.limit, (s): FormEntryView => ({
        id: s.id,
        formId: s.formId,
        formName: s.form.name,
        customerId: s.contactId,
        enquiryId: s.leadId,
        answers: readableAnswers(s.data, s.form.fields),
        createdAt: s.createdAt.toISOString(),
    }));
}
