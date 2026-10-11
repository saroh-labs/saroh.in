import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { whenWords } from "../../common/words-format";
import { ownBookingsWhere, ownDiaryOf } from "../bookings/own-diary";
import { contactEmailForDisplay } from "../contacts/contact-email";

/**
 * The palette's reads beyond people, leads and orders (10 Oct 2026):
 * products, services, bookings, invoices and subscriptions. Each is one
 * capped read scoped to the business, called only when the caller holds
 * that thing's own read permission (`search.service.ts`), and narrowed as
 * its list is: a Calendar only person finds their own bookings.
 */

export type SearchKind =
    | "contact"
    | "lead"
    | "order"
    | "product"
    | "service"
    | "booking"
    | "invoice"
    | "subscription";

export interface SearchHit {
    kind: SearchKind;
    id: string;
    /** The line the merchant recognises: a person's name, a lead's title. */
    title: string;
    /** Disambiguates two hits with the same title. */
    subtitle: string | null;
    href: string;
}

/**
 * Per-entity cap. Five is enough to recognise the one you meant without the
 * palette becoming the list screen it should be sending you to.
 */
export const PER_KIND = 5;

/**
 * Split a query into words that must ALL match, each anywhere on the record.
 *
 * Matching the whole string against each column separately looks right and
 * fails on the most natural thing a person types: "ananya rao" matched neither
 * `firstName` ("Ananya") nor `lastName` ("Rao") nor the email, so searching
 * someone's full name returned nothing while their first name alone worked.
 * Requiring every word to appear SOMEWHERE on the row fixes that without
 * loosening the search — "ananya rao" still cannot match a different Ananya.
 *
 * Capped so a paragraph pasted into the box cannot become a forty-clause query.
 */
const MAX_TERMS = 6;

export function terms(query: string): string[] {
    return query.split(/\s+/).filter(Boolean).slice(0, MAX_TERMS);
}

const has = (term: string) => ({
    contains: term,
    mode: "insensitive" as const,
});

/** A person's display name, falling back to the email. */
export function personName(
    person: {
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
    } | null,
    fallback = "Unknown",
): string {
    const full = [person?.firstName, person?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    if (full) return full;
    return contactEmailForDisplay(person?.email)?.trim() ?? fallback;
}

/** A contact matching `term` by name or email, as a relation filter. */
function personIs(term: string): Prisma.ContactWhereInput {
    return {
        OR: [
            { firstName: has(term) },
            { lastName: has(term) },
            { email: has(term) },
        ],
    };
}

const PERSON = { firstName: true, lastName: true, email: true } as const;

/** What a merchant reads for a product's status: Draft and Live. */
const PRODUCT_STATUS: Partial<Record<string, string>> = {
    DRAFT: "draft",
    PUBLISHED: "live",
    ARCHIVED: "archived",
};

/** By name, or by a variant's SKU. */
export async function searchProducts(
    organizationId: string,
    query: string,
): Promise<SearchHit[]> {
    const rows = await prisma.product.findMany({
        where: {
            organizationId,
            AND: terms(query).map((term) => ({
                OR: [
                    { name: has(term) },
                    { variants: { some: { sku: has(term) } } },
                ],
            })),
        },
        orderBy: { updatedAt: "desc" },
        take: PER_KIND,
        select: { id: true, name: true, status: true },
    });
    return rows.map((row) => ({
        kind: "product" as const,
        id: row.id,
        title: row.name,
        subtitle: PRODUCT_STATUS[row.status] ?? row.status.toLowerCase(),
        href: `/commerce/products/${row.id}`,
    }));
}

/** By name. */
export async function searchServices(
    organizationId: string,
    query: string,
): Promise<SearchHit[]> {
    const rows = await prisma.service.findMany({
        where: {
            organizationId,
            AND: terms(query).map((term) => ({ name: has(term) })),
        },
        orderBy: { updatedAt: "desc" },
        take: PER_KIND,
        select: {
            id: true,
            name: true,
            status: true,
            durationMinutes: true,
        },
    });
    return rows.map((row) => ({
        kind: "service" as const,
        id: row.id,
        title: row.name,
        subtitle:
            row.status === "ARCHIVED"
                ? "archived"
                : `${row.durationMinutes} min`,
        href: `/services/${row.id}`,
    }));
}

/** "12 Oct, 9:30 am", in the zone the booking was made in. */
function bookingWhen(startAt: Date, timeZone: string): string {
    try {
        return whenWords(startAt, timeZone);
    } catch {
        // A zone this runtime doesn't know: the day alone, in UTC.
        return startAt.toISOString().slice(0, 10);
    }
}

/**
 * By who booked or by the service. Never a hold that hasn't become a
 * booking, and for a Calendar only person only their own diary, as the
 * bookings list reads (`own-diary.ts`).
 */
export async function searchBookings(
    ctx: Pick<OrganizationContext, "organizationId" | "userId" | "roleKey">,
    query: string,
): Promise<SearchHit[]> {
    const own = await ownDiaryOf(prisma, ctx);
    const rows = await prisma.booking.findMany({
        where: {
            organizationId: ctx.organizationId,
            status: { in: ["CONFIRMED", "CANCELLED"] },
            AND: [
                ...terms(query).map((term) => ({
                    OR: [
                        { bookerName: has(term) },
                        { bookerEmail: has(term) },
                        { service: { is: { name: has(term) } } },
                        { contact: { is: personIs(term) } },
                    ],
                })),
                ownBookingsWhere(own),
            ],
        },
        orderBy: { startAt: "desc" },
        take: PER_KIND,
        select: {
            id: true,
            startAt: true,
            timezone: true,
            status: true,
            bookerName: true,
            bookerEmail: true,
            service: { select: { name: true } },
            contact: { select: PERSON },
        },
    });
    return rows.map((row) => {
        const contact = personName(row.contact, "");
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const who = contact || row.bookerName?.trim() || "A customer";
        const when = bookingWhen(row.startAt, row.timezone);
        return {
            kind: "booking" as const,
            id: row.id,
            title: `${who}, ${row.service.name}`,
            subtitle: row.status === "CANCELLED" ? `${when} · cancelled` : when,
            href: `/bookings/${row.id}`,
        };
    });
}

/** By its number, or by who it bills. */
export async function searchInvoices(
    organizationId: string,
    query: string,
): Promise<SearchHit[]> {
    const rows = await prisma.invoice.findMany({
        where: {
            organizationId,
            AND: terms(query).map((term) => ({
                OR: [
                    { number: has(term) },
                    { billToName: has(term) },
                    { contact: { is: personIs(term) } },
                ],
            })),
        },
        orderBy: { createdAt: "desc" },
        take: PER_KIND,
        select: {
            id: true,
            number: true,
            status: true,
            billToName: true,
            contact: { select: PERSON },
        },
    });
    return rows.map((row) => {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const who = row.billToName?.trim() || personName(row.contact, "");
        const status = row.status.toLowerCase().replace(/_/g, " ");
        return {
            kind: "invoice" as const,
            id: row.id,
            title: row.number ?? "Draft invoice",
            subtitle: who ? `${who} · ${status}` : status,
            href: `/billing/invoices/${row.id}`,
        };
    });
}

/** By who subscribes, or by the plan's name. */
export async function searchSubscriptions(
    organizationId: string,
    query: string,
): Promise<SearchHit[]> {
    const rows = await prisma.customerSubscription.findMany({
        where: {
            organizationId,
            AND: terms(query).map((term) => ({
                OR: [
                    { plan: { is: { name: has(term) } } },
                    { contact: { is: personIs(term) } },
                ],
            })),
        },
        orderBy: { updatedAt: "desc" },
        take: PER_KIND,
        select: {
            id: true,
            status: true,
            plan: { select: { name: true } },
            contact: { select: PERSON },
        },
    });
    return rows.map((row) => ({
        kind: "subscription" as const,
        id: row.id,
        title: personName(row.contact, "A customer"),
        subtitle: `${row.plan.name} · ${row.status.toLowerCase()}`,
        href: `/billing/subscriptions/${row.id}`,
    }));
}
