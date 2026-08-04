import { Injectable, NotFoundException } from "@nestjs/common";
import type { Contact } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize, can } from "../organizations/organization-policy";
import type { UpdateContactDto } from "./dto";

/**
 * A contact as the list screen needs it: the record, plus the few facts that
 * decide whether it is worth calling today.
 *
 * `openLeadValue` / `openLeadCount` and `nextBookingAt` come from relations the
 * Contact actually owns (`Contact.leads`, `Contact.bookings`), so they are facts
 * about this person, not inferences.
 *
 * ## `lastOrder*` — a READ-TIME reconciliation, and why that distinction matters
 *
 * Orders hang off a commerce `Customer`. A `Customer` is joined to a CRM
 * `Contact` two ways here:
 *
 * 1. an explicit `CustomerIdentityLink` (#120), created by a human; and
 * 2. an exact, case-insensitive email match **within the same Organization**.
 *
 * The second is the part to understand. It is computed per request and never
 * written back — no `CustomerIdentityLink` row is created, nothing is merged,
 * and turning this off is deleting a query rather than unpicking data. That is
 * the whole reason it is safe to ship while SEC-005 / ARCH-001 are still open:
 * those decide what a PERSISTED unified customer record means and who may act on
 * it. This decides only what one merchant sees on one screen, from two records
 * they already own, in one Organization they already administer.
 *
 * Two consequences worth stating rather than discovering:
 *
 * - `Customer.email` is unique per STORE, not per Organization, so one contact
 *   can match customers in several stores. Their orders are unioned, which is
 *   the correct reading of "when did this person last buy from us".
 * - A merchant who orders under a different address than they enquired with will
 *   show no order here. That is an under-report, not a wrong report — the column
 *   can be silent, but it must never attribute someone else's purchase.
 */
export interface ContactListItem extends Contact {
    /** Sum of OPEN lead values in MINOR units; null when there are none. */
    openLeadValue: number | null;
    openLeadCount: number;
    /** The next confirmed booking's start, or null. */
    nextBookingAt: Date | null;
    /** When this person last bought, across every store in the org. */
    lastOrderAt: Date | null;
    /** That order's total, in MAJOR units as a decimal string, with its currency. */
    lastOrderTotal: string | null;
    lastOrderCurrency: string | null;
}

/** The last order found for one contact. */
interface LastOrder {
    at: Date;
    total: string;
    currency: string;
}

/**
 * Org-owned CRM Contact reads + light edits (S3-005).
 *
 * Every operation is tenant-scoped by `ctx.organizationId` (taken from the
 * resolved {@link OrganizationContext}, proven by `OrganizationGuard`, never a
 * client-supplied value) and gated by the central policy: reads require
 * `contact:read`, edits require `contact:write` (both OWNER/ADMIN-only — CRM
 * rows are customer PII). Cross-tenant or missing ids surface as a 404 (never a
 * 403) so a caller can't probe which contacts exist in another org, mirroring
 * `DomainsService.requireOwned`.
 */
@Injectable()
export class ContactsService {
    /**
     * The org's contacts, newest first, each carrying the rollup that makes the
     * row worth reading — see {@link ContactListItem}.
     *
     * Three queries, not one-per-contact: the rollups are `groupBy` aggregates
     * over the whole page, so a thousand contacts still cost three round trips.
     * Each rollup is gated on the actor's own permission for the data it reads
     * (`lead:read`, `booking:read`) rather than riding on `contact:read` —
     * today those tiers coincide, and the moment they stop, this must not be
     * the hole that leaks pipeline value to a role that cannot open a lead.
     */
    async list(ctx: OrganizationContext): Promise<ContactListItem[]> {
        authorize(ctx, "contact:read");

        const contacts = await prisma.contact.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
        });
        if (contacts.length === 0) return [];

        const contactIds = contacts.map((c) => c.id);
        const [leadsByContact, nextBookingByContact, lastOrderByContact] =
            await Promise.all([
                this.openLeadsByContact(ctx, contactIds),
                this.nextBookingByContact(ctx, contactIds),
                this.lastOrderByContact(ctx, contacts),
            ]);

        return contacts.map((contact) => {
            const leads = leadsByContact.get(contact.id);
            const order = lastOrderByContact.get(contact.id);
            return {
                ...contact,
                openLeadValue: leads?.value ?? null,
                openLeadCount: leads?.count ?? 0,
                nextBookingAt: nextBookingByContact.get(contact.id) ?? null,
                lastOrderAt: order?.at ?? null,
                lastOrderTotal: order?.total ?? null,
                lastOrderCurrency: order?.currency ?? null,
            };
        });
    }

    /** Open pipeline value and count per contact, in one aggregate. */
    private async openLeadsByContact(
        ctx: OrganizationContext,
        contactIds: string[],
    ): Promise<Map<string, { value: number | null; count: number }>> {
        const out = new Map<string, { value: number | null; count: number }>();
        if (!can(ctx.role, "lead:read")) return out;

        const rows = await prisma.lead.groupBy({
            by: ["contactId"],
            where: {
                organizationId: ctx.organizationId,
                contactId: { in: contactIds },
                status: "OPEN",
            },
            _sum: { value: true },
            _count: { _all: true },
        });

        for (const row of rows) {
            out.set(row.contactId, {
                // `value` is nullable on Lead, so a contact can have open leads
                // whose total is unknown: count > 0 with value null is a real
                // state and must not collapse to zero.
                value: row._sum.value,
                count: row._count._all,
            });
        }
        return out;
    }

    /** The soonest confirmed future booking per contact, in one aggregate. */
    private async nextBookingByContact(
        ctx: OrganizationContext,
        contactIds: string[],
    ): Promise<Map<string, Date>> {
        const out = new Map<string, Date>();
        if (!can(ctx.role, "booking:read")) return out;

        const rows = await prisma.booking.groupBy({
            by: ["contactId"],
            where: {
                organizationId: ctx.organizationId,
                contactId: { in: contactIds },
                status: "CONFIRMED",
                startAt: { gte: new Date() },
            },
            _min: { startAt: true },
        });

        for (const row of rows) {
            // `contactId` is nullable on Booking, so the grouping key is too —
            // an unlinked walk-in books without a Contact.
            const startAt = row._min.startAt;
            if (row.contactId && startAt) out.set(row.contactId, startAt);
        }
        return out;
    }

    /**
     * The most recent order for each contact, resolved at read time.
     *
     * Four bounded queries, none of which scale with the number of orders:
     *
     * 1. explicit `CustomerIdentityLink` rows for this page of contacts;
     * 2. `Customer` rows in this org whose email matches one of these contacts;
     * 3. `groupBy` for the newest order instant per matched customer;
     * 4. one `findMany` restricted to those exact instants.
     *
     * Step 4 is why this does not fetch a merchant's whole order history to find
     * a date. `groupBy` gives the timestamps but not the totals, so the final
     * read is narrowed to `createdAt IN (those instants)` and the exact
     * customer+instant pair is re-checked in code — an order that merely shares a
     * timestamp with another customer's latest is discarded rather than
     * misattributed.
     *
     * Gated on `order:read` in its own right. Someone who may read contacts but
     * not orders sees the column empty rather than populated by a join they were
     * not entitled to.
     */
    private async lastOrderByContact(
        ctx: OrganizationContext,
        contacts: Contact[],
    ): Promise<Map<string, LastOrder>> {
        const out = new Map<string, LastOrder>();
        if (!can(ctx.role, "order:read")) return out;

        const contactIds = contacts.map((c) => c.id);

        // Emails are compared lower-cased on both sides. `Contact.email` is
        // unique per org and `Customer.email` per store, but neither is
        // normalised on write, so "Ananya@x.com" and "ananya@x.com" are the same
        // person to everyone except a case-sensitive equality test.
        const emailToContactIds = new Map<string, string[]>();
        for (const contact of contacts) {
            const key = contact.email.trim().toLowerCase();
            if (!key) continue;
            const bucket = emailToContactIds.get(key);
            if (bucket) bucket.push(contact.id);
            else emailToContactIds.set(key, [contact.id]);
        }

        const [links, customers] = await Promise.all([
            prisma.customerIdentityLink.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    contactId: { in: contactIds },
                },
                select: { contactId: true, customerId: true },
            }),
            emailToContactIds.size === 0
                ? Promise.resolve([])
                : prisma.customer.findMany({
                      where: {
                          organizationId: ctx.organizationId,
                          email: {
                              in: [...emailToContactIds.keys()],
                              mode: "insensitive",
                          },
                      },
                      select: { id: true, email: true },
                  }),
        ]);

        /** customerId → the contacts it counts for (a customer may match one). */
        const customerToContactIds = new Map<string, Set<string>>();
        const attach = (customerId: string, contactId: string) => {
            const bucket = customerToContactIds.get(customerId);
            if (bucket) bucket.add(contactId);
            else customerToContactIds.set(customerId, new Set([contactId]));
        };

        for (const link of links) attach(link.customerId, link.contactId);
        for (const customer of customers) {
            const key = customer.email.trim().toLowerCase();
            for (const contactId of emailToContactIds.get(key) ?? []) {
                attach(customer.id, contactId);
            }
        }

        const customerIds = [...customerToContactIds.keys()];
        if (customerIds.length === 0) return out;

        /*
         * Scoped by customerId, NOT by `Order.organizationId`.
         *
         * That column is nullable, so filtering on it would silently drop orders
         * on rows where it was never populated — reporting "never ordered" for
         * someone who has. The customer ids were themselves read under
         * `ctx.organizationId` (via the link table or the org-scoped customer
         * query), so the tenant boundary is already proven by the time we get
         * here; adding a nullable column to the predicate weakens the result
         * without strengthening the guarantee.
         */
        const newest = await prisma.order.groupBy({
            by: ["customerId"],
            where: { customerId: { in: customerIds } },
            _max: { createdAt: true },
        });

        const newestByCustomer = new Map<string, Date>();
        for (const row of newest) {
            if (row._max.createdAt) {
                newestByCustomer.set(row.customerId, row._max.createdAt);
            }
        }
        if (newestByCustomer.size === 0) return out;

        const orders = await prisma.order.findMany({
            where: {
                customerId: { in: [...newestByCustomer.keys()] },
                createdAt: { in: [...newestByCustomer.values()] },
            },
            select: {
                customerId: true,
                createdAt: true,
                total: true,
                currency: true,
            },
        });

        for (const order of orders) {
            // Re-check the pair: the `IN` above matches any customer at any of
            // the collected instants, so a coincidental timestamp collision
            // between two customers would otherwise cross-attribute an order.
            const newestForThis = newestByCustomer.get(order.customerId);
            if (newestForThis?.getTime() !== order.createdAt.getTime())
                continue;

            for (const contactId of customerToContactIds.get(
                order.customerId,
            ) ?? []) {
                // A contact can match customers in several stores; the latest
                // across all of them is the answer to "when did they last buy".
                const current = out.get(contactId);
                if (current && current.at >= order.createdAt) continue;
                out.set(contactId, {
                    at: order.createdAt,
                    total: order.total.toString(),
                    currency: order.currency,
                });
            }
        }

        return out;
    }

    /**
     * A contact plus its leads (newest first, each with its current stage), or a
     * 404 for a missing / cross-tenant id. Authorizes `contact:read`.
     */
    async get(ctx: OrganizationContext, contactId: string) {
        authorize(ctx, "contact:read");

        const contact = await prisma.contact.findUnique({
            where: { id: contactId },
            include: {
                leads: {
                    orderBy: { createdAt: "desc" },
                    include: { stage: true, pipeline: true },
                },
            },
        });
        if (contact?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Contact not found");
        }
        return contact;
    }

    /**
     * Patch a contact's descriptive fields (never its email identity). Authorizes
     * `contact:write`; cross-tenant or missing ids 404 before any write. Only the
     * fields present in the DTO are applied — a sparse patch.
     */
    async update(
        ctx: OrganizationContext,
        contactId: string,
        dto: UpdateContactDto,
    ): Promise<Contact> {
        authorize(ctx, "contact:write");

        await this.requireOwned(ctx, contactId);

        return prisma.contact.update({
            where: { id: contactId },
            data: {
                ...(dto.firstName !== undefined
                    ? { firstName: dto.firstName }
                    : {}),
                ...(dto.lastName !== undefined
                    ? { lastName: dto.lastName }
                    : {}),
                ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
                ...(dto.company !== undefined ? { company: dto.company } : {}),
            },
        });
    }

    /**
     * Load a contact and assert it belongs to `ctx.organizationId`. Throws
     * `NotFoundException` for a missing OR cross-tenant id — a 404 (not 403) so a
     * caller can't probe which contacts exist in another org.
     */
    private async requireOwned(
        ctx: OrganizationContext,
        contactId: string,
    ): Promise<Contact> {
        const contact = await prisma.contact.findUnique({
            where: { id: contactId },
        });
        if (contact?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Contact not found");
        }
        return contact;
    }
}
