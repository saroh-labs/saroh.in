import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { contactEmailForDisplay } from "../contacts/contact-email";
import { orderLocationWhere } from "../orders/order-location";
import { orderPartyName } from "../orders/walk-in";
import { allows } from "../organizations/organization-policy";
import type { SearchHit } from "./search-kinds";
import {
    PER_KIND,
    personName,
    searchBookings,
    searchInvoices,
    searchProducts,
    searchServices,
    searchSubscriptions,
    terms,
} from "./search-kinds";

export type { SearchHit, SearchKind } from "./search-kinds";

/**
 * Cross-entity quick search for the command palette.
 *
 * ## Why this exists
 *
 * The ⌘K palette shipped mapping `NAV_GROUPS` and nothing else, so it contained
 * exactly the fifteen links already visible in the rail. Its placeholder said
 * "Search or jump to…" and typing a customer's name returned "No results found".
 * A power user tries that once and never opens it again — the audit scored the
 * whole efficiency heuristic 1/10 on it. A search box that cannot find the thing
 * you are looking at is worse than no search box, because it also costs the
 * belief that searching is possible.
 *
 * ## Shape
 *
 * One request, one capped read per kind of thing (people, leads, orders, and
 * since 10 Oct 2026 products, services, bookings, invoices and subscriptions,
 * `search-kinds.ts`), run only for the entities the actor may read.
 * Every result carries the `href` the client should navigate to, so the palette
 * never has to know how a URL is built for an entity type — the same reason
 * Home's actions carry theirs.
 *
 * Deliberately NOT full-text. Postgres `ILIKE` on a handful of indexed columns
 * is the right tool at a single merchant's scale, and pretending otherwise would
 * mean a tsvector migration, a ranking function and an index nobody has measured
 * the need for. When one merchant's contacts outgrow this, the endpoint changes
 * and its contract does not.
 */
export interface SearchResult {
    query: string;
    hits: SearchHit[];
}

/** Below this a query matches most of the database and helps nobody. */
const MIN_QUERY = 2;

@Injectable()
export class SearchService {
    async search(
        ctx: OrganizationContext,
        rawQuery: string,
    ): Promise<SearchResult> {
        const query = rawQuery.trim();
        if (query.length < MIN_QUERY) return { query, hits: [] };

        // Each entity is gated on ITS OWN read action, not on a single
        // "search" permission. A palette is a read surface like any other, and
        // it must not become the one place where a role sees rows the list
        // screens would have refused it.
        const org = ctx.organizationId;
        const groups = await Promise.all([
            allows(ctx, "contact:read") ? this.contacts(org, query) : [],
            allows(ctx, "lead:read") ? this.leads(org, query) : [],
            allows(ctx, "order:read") ? this.orders(ctx, query) : [],
            // The catalogue is read with the storefronts (`ProductAccess`).
            allows(ctx, "store:read") ? searchProducts(org, query) : [],
            allows(ctx, "booking:read") ? searchBookings(ctx, query) : [],
            allows(ctx, "invoice:read") ? searchInvoices(org, query) : [],
            allows(ctx, "service:read") ? searchServices(org, query) : [],
            allows(ctx, "subscription:read")
                ? searchSubscriptions(org, query)
                : [],
        ]);

        return { query, hits: groups.flat() };
    }

    private async contacts(
        organizationId: string,
        query: string,
    ): Promise<SearchHit[]> {
        const rows = await prisma.contact.findMany({
            where: {
                organizationId,
                // Never a merge's tombstone or a privacy removal: lists and
                // search leave them out (`backend-data-and-money.md`).
                mergedIntoId: null,
                removedAt: null,
                // Every word must appear somewhere on the contact. The
                // phone too: a customer who rings is found by their number.
                AND: terms(query).map((term) => ({
                    OR: [
                        { firstName: { contains: term, mode: "insensitive" } },
                        { lastName: { contains: term, mode: "insensitive" } },
                        { email: { contains: term, mode: "insensitive" } },
                        { company: { contains: term, mode: "insensitive" } },
                        { phone: { contains: term } },
                    ],
                })),
            },
            orderBy: { updatedAt: "desc" },
            take: PER_KIND,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                company: true,
            },
        });

        return rows.map((row) => ({
            kind: "contact" as const,
            id: row.id,
            title: personName(row),
            // The email, not the company: two people at the same company are
            // exactly the pair this line has to tell apart.
            // Never a placeholder (a walk-in kept by phone, B13b).
            subtitle: contactEmailForDisplay(row.email) ?? "",
            href: `/contacts/${row.id}`,
        }));
    }

    private async leads(
        organizationId: string,
        query: string,
    ): Promise<SearchHit[]> {
        const rows = await prisma.lead.findMany({
            where: {
                organizationId,
                AND: terms(query).map((term) => ({
                    OR: [
                        { title: { contains: term, mode: "insensitive" } },
                        {
                            contact: {
                                is: {
                                    OR: [
                                        {
                                            firstName: {
                                                contains: term,
                                                mode: "insensitive",
                                            },
                                        },
                                        {
                                            lastName: {
                                                contains: term,
                                                mode: "insensitive",
                                            },
                                        },
                                        {
                                            email: {
                                                contains: term,
                                                mode: "insensitive",
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                })),
            },
            orderBy: { updatedAt: "desc" },
            take: PER_KIND,
            select: {
                id: true,
                title: true,
                status: true,
                contact: {
                    select: {
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
            },
        });

        return rows.map((row) => ({
            kind: "lead" as const,
            id: row.id,
            title: row.title,
            // Who it is about, and whether it is still live — the two facts that
            // decide whether this is the lead you meant.
            subtitle: `${personName(row.contact)} · ${row.status.toLowerCase()}`,
            href: `/leads/${row.id}`,
        }));
    }

    private async orders(
        ctx: OrganizationContext,
        query: string,
    ): Promise<SearchHit[]> {
        const rows = await prisma.order.findMany({
            where: {
                organizationId: ctx.organizationId,
                // A location's own people find their location's orders.
                ...orderLocationWhere(ctx),
                AND: terms(query).map((term) => ({
                    OR: [
                        { orderId: { contains: term, mode: "insensitive" } },
                        // Its number before P3 renumbered it (DEC-066).
                        {
                            renumberedFrom: {
                                contains: term,
                                mode: "insensitive",
                            },
                        },
                        // A walk-in (B13), by the name they gave.
                        {
                            walkInName: {
                                contains: term,
                                mode: "insensitive",
                            },
                        },
                        {
                            customer: {
                                is: {
                                    OR: [
                                        {
                                            firstName: {
                                                contains: term,
                                                mode: "insensitive",
                                            },
                                        },
                                        {
                                            lastName: {
                                                contains: term,
                                                mode: "insensitive",
                                            },
                                        },
                                        {
                                            email: {
                                                contains: term,
                                                mode: "insensitive",
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                })),
            },
            orderBy: { createdAt: "desc" },
            take: PER_KIND,
            select: {
                id: true,
                orderId: true,
                storeId: true,
                status: true,
                customer: {
                    select: {
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
                walkInName: true,
            },
        });

        return rows.map((row) => ({
            kind: "order" as const,
            id: row.id,
            title: row.orderId,
            subtitle: `${orderPartyName(row, { label: true })} · ${row.status.toLowerCase()}`,
            href: `/commerce/orders/${row.id}?storefront=${row.storeId}`,
        }));
    }
}
