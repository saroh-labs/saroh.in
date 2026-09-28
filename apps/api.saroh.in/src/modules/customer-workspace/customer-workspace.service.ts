import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { CustomerLinkReason } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction } from "../audit/audit.service";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { allows, authorize } from "../organizations/organization-policy";
import type { MatchedOn } from "./duplicates";
import { duplicatesOf, storeCustomerMatches } from "./duplicates";
import {
    contactCandidates,
    loadContactIdentities,
    storeCustomerCandidates,
} from "./suggestion-candidates";

/**
 * Unified customer workspace (#120, Task 5).
 *
 * The workspace *connects* a person's CRM Contact and commerce Customer records
 * without merging them. Saroh NEVER auto-links on weak evidence: only an exact
 * normalized email/phone produces a *suggestion*, and a user confirms it. The
 * one link Saroh makes itself is to a contact it has just made for a paying
 * store customer (C2, `ensure-contact.ts`). Links
 * are Organization-scoped, audited, and reversible, and can never cross
 * Organizations (every lookup is org-scoped). The timeline read model composes
 * events across modules, excluding any module that isn't available to the actor.
 */
/** A store customer who is likely this contact (#120): link them. */
export interface IdentitySuggestion {
    kind: "customer";
    customerId: string;
    name: string;
    email: string;
    matchedOn: MatchedOn[];
}

/** Another contact who is likely the same person (C2): merge them (C9). */
export interface ContactDuplicateSuggestion {
    kind: "contact";
    contactId: string;
    name: string | null;
    /** Never a reserved placeholder (`contacts/contact-email.ts`). */
    email: string | null;
    matchedOn: MatchedOn[];
    /** Whether they sign in on the business's site. */
    signsIn: boolean;
}

export type Suggestion = IdentitySuggestion | ContactDuplicateSuggestion;

export type TimelineEventType =
    "LEAD" | "BOOKING" | "ORDER" | "MESSAGE" | "LINK" | "MERGE";

export interface TimelineEvent {
    type: TimelineEventType;
    at: string; // ISO
    title: string;
    moduleKey: string;
}

/** How a link reads on the timeline: who or what made it (C2). */
const LINK_TITLES: Record<CustomerLinkReason, string> = {
    MANUAL: "Linked to their store record by your team",
    BACKFILL: "Linked when the list was set up",
    PAYMENT: "Linked when they paid",
    SITE_ACCOUNT: "Linked when they signed in on your website",
};

@Injectable()
export class CustomerWorkspaceService {
    constructor(
        private readonly availability: ModuleAvailabilityService,
        @Optional() private readonly db: typeof prisma = prisma,
    ) {}

    /**
     * Who is very likely the same person as a Contact — by EXACT normalised
     * email or phone only, never by name (`duplicates.ts`). Store customers
     * to link always; other contacts to merge when `includeContacts` (C2).
     * Today's Customer Detail doesn't ask for them, since it can only link.
     * Suggesting never writes anything.
     */
    async suggestLinks(
        ctx: OrganizationContext,
        contactId: string,
        opts: { includeContacts?: boolean } = {},
    ): Promise<Suggestion[]> {
        authorize(ctx, "contact:read");
        const me = (
            await loadContactIdentities(this.db, ctx.organizationId, [
                contactId,
            ])
        ).find((c) => c.id === contactId);
        if (!me) throw new NotFoundException("Contact not found");

        const customers = await storeCustomerCandidates(
            this.db,
            ctx.organizationId,
            me,
        );
        const byCustomer = new Map(customers.map((c) => [c.id, c]));
        const out: Suggestion[] = storeCustomerMatches(me, customers).map(
            (m) => {
                const c = byCustomer.get(m.id);
                return {
                    kind: "customer",
                    customerId: m.id,
                    name: c?.name ?? "",
                    email: c?.email ?? "",
                    matchedOn: m.matchedOn,
                };
            },
        );
        if (!opts.includeContacts) return out;

        const contacts = await contactCandidates(
            this.db,
            ctx.organizationId,
            me,
        );
        const byContact = new Map(contacts.map((c) => [c.id, c]));
        for (const m of duplicatesOf(me, contacts)) {
            const c = byContact.get(m.id);
            out.push({
                kind: "contact",
                contactId: m.id,
                name: c?.name ?? null,
                email: c?.displayEmail ?? null,
                matchedOn: m.matchedOn,
                signsIn: c?.account != null,
            });
        }
        return out;
    }

    /** Confirm a link between a Contact and a Customer (both must be in the org). */
    async link(
        ctx: OrganizationContext,
        contactId: string,
        customerId: string,
    ): Promise<void> {
        authorize(ctx, "contact:write");
        await this.requireContact(ctx, contactId);
        await this.requireCustomer(ctx, customerId);

        await this.db.$transaction(async (tx) => {
            await tx.customerIdentityLink.upsert({
                where: { contactId_customerId: { contactId, customerId } },
                create: {
                    organizationId: ctx.organizationId,
                    contactId,
                    customerId,
                    linkedByUserId: ctx.userId,
                    reason: "MANUAL",
                },
                update: {},
            });
            await tx.auditEvent.create({
                data: {
                    action: "customer.identity.linked",
                    actorUserId: ctx.userId,
                    organizationId: ctx.organizationId,
                    targetType: "contact",
                    targetId: contactId,
                    outcome: "SUCCESS",
                    metadata: { customerId },
                },
            });
        });
    }

    /** Reverse a link (records are untouched). */
    async unlink(ctx: OrganizationContext, linkId: string): Promise<void> {
        authorize(ctx, "contact:write");
        await this.db.$transaction(async (tx) => {
            const deleted = await tx.customerIdentityLink.deleteMany({
                where: { id: linkId, organizationId: ctx.organizationId },
            });
            if (deleted.count > 0) {
                await tx.auditEvent.create({
                    data: {
                        action: "customer.identity.unlinked",
                        actorUserId: ctx.userId,
                        organizationId: ctx.organizationId,
                        targetType: "identityLink",
                        targetId: linkId,
                        outcome: "SUCCESS",
                    },
                });
            }
        });
    }

    /**
     * The contact a store customer is linked to, if a person linked them
     * (U18: the store customer's page opens Customer Detail). The oldest link
     * wins when one customer was linked twice. Null when unlinked.
     */
    async contactFor(
        ctx: OrganizationContext,
        customerId: string,
    ): Promise<{ contactId: string | null }> {
        authorize(ctx, "contact:read");
        const link = await this.db.customerIdentityLink.findFirst({
            where: { organizationId: ctx.organizationId, customerId },
            orderBy: { createdAt: "asc" },
            select: { contactId: true },
        });
        return { contactId: link?.contactId ?? null };
    }

    /** A chronological, module-gated activity timeline for one Contact. */
    async timeline(
        ctx: OrganizationContext,
        contactId: string,
    ): Promise<{ events: TimelineEvent[] }> {
        authorize(ctx, "contact:read");
        await this.requireContact(ctx, contactId);

        const views = await this.availability.listViews({
            organizationId: ctx.organizationId,
            organizationRole: ctx.role,
            organizationActions: ctx.actions,
        });
        const available = new Set(
            views.filter((v) => v.readiness !== "DISABLED").map((v) => v.key),
        );

        const links = await this.db.customerIdentityLink.findMany({
            where: { contactId, organizationId: ctx.organizationId },
            select: { customerId: true, reason: true, createdAt: true },
        });
        const customerIds = links.map((l) => l.customerId);

        const events: TimelineEvent[] = [];

        // The module is reachable with `contact:read` since DEC-020, so the
        // lead rows ask for `lead:read` themselves.
        if (available.has("CRM") && allows(ctx, "lead:read")) {
            const leads = await this.db.lead.findMany({
                where: { contactId, organizationId: ctx.organizationId },
                select: { title: true, createdAt: true },
                take: 50,
            });
            for (const lead of leads)
                events.push({
                    type: "LEAD",
                    at: lead.createdAt.toISOString(),
                    title: lead.title,
                    moduleKey: "CRM",
                });
        }

        if (available.has("APPOINTMENTS")) {
            const bookings = await this.db.booking.findMany({
                where: { contactId, organizationId: ctx.organizationId },
                select: { startAt: true },
                take: 50,
            });
            for (const booking of bookings)
                events.push({
                    type: "BOOKING",
                    at: booking.startAt.toISOString(),
                    title: "Booking",
                    moduleKey: "APPOINTMENTS",
                });
        }

        if (available.has("COMMERCE")) {
            for (const link of links)
                events.push({
                    type: "LINK",
                    at: link.createdAt.toISOString(),
                    title: LINK_TITLES[link.reason],
                    moduleKey: "COMMERCE",
                });
        }

        if (available.has("COMMERCE") && customerIds.length > 0) {
            const orders = await this.db.order.findMany({
                where: {
                    customerId: { in: customerIds },
                    organizationId: ctx.organizationId,
                },
                select: { createdAt: true, status: true },
                take: 50,
            });
            for (const order of orders)
                events.push({
                    type: "ORDER",
                    at: order.createdAt.toISOString(),
                    title: `Order (${order.status})`,
                    moduleKey: "COMMERCE",
                });
        }

        if (available.has("COMMUNICATIONS")) {
            const messages = await this.db.message.findMany({
                where: { contactId, organizationId: ctx.organizationId },
                select: { subject: true, channel: true, createdAt: true },
                take: 50,
            });
            for (const message of messages)
                events.push({
                    type: "MESSAGE",
                    at: message.createdAt.toISOString(),
                    title: message.subject ?? `${message.channel} message`,
                    moduleKey: "COMMUNICATIONS",
                });
        }

        // A merge into this person (C9): the audit row names them as the
        // target. It is about the person, not a module, so it always shows.
        const merges = await this.db.auditEvent.findMany({
            where: {
                organizationId: ctx.organizationId,
                action: AuditAction.CustomerMerged,
                targetType: "contact",
                targetId: contactId,
            },
            select: { createdAt: true },
            take: 50,
        });
        for (const merge of merges)
            events.push({
                type: "MERGE",
                at: merge.createdAt.toISOString(),
                title: "Merged with a duplicate",
                moduleKey: "CRM",
            });

        events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
        return { events };
    }

    private async requireContact(ctx: OrganizationContext, contactId: string) {
        const contact = await this.db.contact.findFirst({
            where: { id: contactId, organizationId: ctx.organizationId },
            select: { id: true, email: true, phone: true },
        });
        if (!contact) throw new NotFoundException("Contact not found");
        return contact;
    }

    private async requireCustomer(
        ctx: OrganizationContext,
        customerId: string,
    ) {
        const customer = await this.db.customer.findFirst({
            where: { id: customerId, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!customer) throw new NotFoundException("Customer not found");
        return customer;
    }
}
