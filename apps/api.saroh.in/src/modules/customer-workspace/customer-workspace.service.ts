import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { authorize } from "../organizations/organization-policy";

/**
 * Unified customer workspace (#120, Task 5).
 *
 * The workspace *connects* a person's CRM Contact and commerce Customer records
 * without merging them. Saroh NEVER auto-links on weak evidence: only an exact
 * normalized email/phone produces a *suggestion*, and a user confirms it. Links
 * are Organization-scoped, audited, and reversible, and can never cross
 * Organizations (every lookup is org-scoped). The timeline read model composes
 * events across modules, excluding any module that isn't available to the actor.
 */
export interface IdentitySuggestion {
    customerId: string;
    name: string;
    email: string;
    matchedOn: ("email" | "phone")[];
}

export type TimelineEventType = "LEAD" | "BOOKING" | "ORDER" | "MESSAGE";

export interface TimelineEvent {
    type: TimelineEventType;
    at: string; // ISO
    title: string;
    moduleKey: string;
}

const normalizeEmail = (v: string) => v.trim().toLowerCase();
const normalizePhone = (v: string) => v.replace(/\D/g, "");

@Injectable()
export class CustomerWorkspaceService {
    constructor(
        private readonly availability: ModuleAvailabilityService,
        @Optional() private readonly db: typeof prisma = prisma,
    ) {}

    /** Suggest commerce Customers that are very likely the same person as a
     * Contact — by EXACT normalized email/phone only, never by name. */
    async suggestLinks(
        ctx: OrganizationContext,
        contactId: string,
    ): Promise<IdentitySuggestion[]> {
        authorize(ctx, "contact:read");
        const contact = await this.requireContact(ctx, contactId);

        const alreadyLinked = await this.db.customerIdentityLink.findMany({
            where: { contactId },
            select: { customerId: true },
        });
        const excluded = alreadyLinked.map((l) => l.customerId);

        const email = normalizeEmail(contact.email);
        const phone = contact.phone ? normalizePhone(contact.phone) : "";

        const candidates = await this.db.customer.findMany({
            where: {
                organizationId: ctx.organizationId,
                id: { notIn: excluded.length > 0 ? excluded : undefined },
                OR: [
                    { email: { equals: email, mode: "insensitive" } },
                    ...(phone ? [{ phone }] : []),
                ],
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
            },
        });

        return candidates.map((c) => {
            const matchedOn: ("email" | "phone")[] = [];
            if (normalizeEmail(c.email) === email) matchedOn.push("email");
            if (phone && c.phone && normalizePhone(c.phone) === phone)
                matchedOn.push("phone");
            return {
                customerId: c.id,
                name:
                    [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                    c.email,
                email: c.email,
                matchedOn,
            };
        });
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
        });
        const available = new Set(
            views.filter((v) => v.readiness !== "DISABLED").map((v) => v.key),
        );

        const links = await this.db.customerIdentityLink.findMany({
            where: { contactId, organizationId: ctx.organizationId },
            select: { customerId: true },
        });
        const customerIds = links.map((l) => l.customerId);

        const events: TimelineEvent[] = [];

        if (available.has("CRM")) {
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
