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
 * ## What is here, and what is deliberately not
 *
 * `openLeadValue` / `openLeadCount` and `nextBookingAt` come from relations the
 * Contact actually owns (`Contact.leads`, `Contact.bookings`), so they are facts
 * about this person, not inferences.
 *
 * There is no `lastOrderAt`. Orders hang off a commerce `Customer`, which is
 * joined to a CRM `Contact` only through an explicit `CustomerIdentityLink`
 * (#120) that a human creates by hand. Matching the two by email instead — the
 * obvious shortcut — IS the auto-linking that SEC-005 / ARCH-001 have not
 * approved, and shipping it quietly inside a list query would be deciding that
 * open question by accident. Rendering the column from links alone is no better:
 * almost every row would show "no orders" for a customer who has ordered,
 * because nobody has linked them yet, and a wrong fact drawn confidently is
 * worse than an absent one.
 */
export interface ContactListItem extends Contact {
    /** Sum of OPEN lead values in MINOR units; null when there are none. */
    openLeadValue: number | null;
    openLeadCount: number;
    /** The next confirmed booking's start, or null. */
    nextBookingAt: Date | null;
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
        const [leadsByContact, nextBookingByContact] = await Promise.all([
            this.openLeadsByContact(ctx, contactIds),
            this.nextBookingByContact(ctx, contactIds),
        ]);

        return contacts.map((contact) => {
            const leads = leadsByContact.get(contact.id);
            return {
                ...contact,
                openLeadValue: leads?.value ?? null,
                openLeadCount: leads?.count ?? 0,
                nextBookingAt: nextBookingByContact.get(contact.id) ?? null,
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
