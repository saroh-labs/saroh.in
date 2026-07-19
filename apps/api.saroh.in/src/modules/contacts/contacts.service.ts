import { Injectable, NotFoundException } from "@nestjs/common";
import type { Contact } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type { UpdateContactDto } from "./dto";

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
    /** The org's contacts, newest first. Tenant-scoped by ctx. */
    async list(ctx: OrganizationContext): Promise<Contact[]> {
        authorize(ctx, "contact:read");
        return prisma.contact.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
        });
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
