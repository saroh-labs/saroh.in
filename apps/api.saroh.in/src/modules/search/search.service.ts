import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { can } from "../organizations/organization-policy";

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
 * One request, three capped reads, run only for the entities the actor may read.
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
export type SearchKind = "contact" | "lead" | "order";

export interface SearchHit {
    kind: SearchKind;
    id: string;
    /** The line the merchant recognises: a person's name, a lead's title. */
    title: string;
    /** Disambiguates two hits with the same title. */
    subtitle: string | null;
    href: string;
}

export interface SearchResult {
    query: string;
    hits: SearchHit[];
}

/**
 * Per-entity cap. Five is enough to recognise the one you meant without the
 * palette becoming the list screen it should be sending you to.
 */
const PER_KIND = 5;

/** Below this a query matches most of the database and helps nobody. */
const MIN_QUERY = 2;

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

function terms(query: string): string[] {
    return query.split(/\s+/).filter(Boolean).slice(0, MAX_TERMS);
}

/** A person's display name, falling back to the email. */
function personName(person: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
}): string {
    const full = [person.firstName, person.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    if (full) return full;
    return person.email?.trim() ?? "Unknown";
}

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
        const [contacts, leads, orders] = await Promise.all([
            can(ctx.role, "contact:read")
                ? this.contacts(ctx.organizationId, query)
                : [],
            can(ctx.role, "lead:read")
                ? this.leads(ctx.organizationId, query)
                : [],
            can(ctx.role, "order:read")
                ? this.orders(ctx.organizationId, query)
                : [],
        ]);

        return { query, hits: [...contacts, ...leads, ...orders] };
    }

    private async contacts(
        organizationId: string,
        query: string,
    ): Promise<SearchHit[]> {
        const rows = await prisma.contact.findMany({
            where: {
                organizationId,
                // Every word must appear somewhere on the contact.
                AND: terms(query).map((term) => ({
                    OR: [
                        { firstName: { contains: term, mode: "insensitive" } },
                        { lastName: { contains: term, mode: "insensitive" } },
                        { email: { contains: term, mode: "insensitive" } },
                        { company: { contains: term, mode: "insensitive" } },
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
            subtitle: row.email,
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
        organizationId: string,
        query: string,
    ): Promise<SearchHit[]> {
        const rows = await prisma.order.findMany({
            where: {
                organizationId,
                AND: terms(query).map((term) => ({
                    OR: [
                        { orderId: { contains: term, mode: "insensitive" } },
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
            },
        });

        return rows.map((row) => ({
            kind: "order" as const,
            id: row.id,
            title: row.orderId,
            subtitle: `${personName(row.customer)} · ${row.status.toLowerCase()}`,
            href: `/stores/${row.storeId}/orders/${row.id}`,
        }));
    }
}
