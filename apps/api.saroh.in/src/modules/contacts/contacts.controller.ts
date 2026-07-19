import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactsService } from "./contacts.service";
import { UpdateContactDto } from "./dto";

/**
 * CRM Contact endpoints for an Organization (S3-005), scoped to
 * `/organizations/:organizationId/contacts`.
 *
 * Double-guarded: `BetterAuthGuard` authenticates the session user and
 * `OrganizationGuard` resolves an authorized {@link OrganizationContext} from
 * the `:organizationId` param. Handlers receive only that proven context via
 * `@OrgContext()`; the service enforces the `contact:read` / `contact:write`
 * policy on top.
 */
@Controller("organizations/:organizationId/contacts")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class ContactsController {
    constructor(private readonly contacts: ContactsService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        return this.contacts.list(ctx);
    }

    @Get(":contactId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ) {
        return this.contacts.get(ctx, contactId);
    }

    @Patch(":contactId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Body() dto: UpdateContactDto,
    ) {
        return this.contacts.update(ctx, contactId, dto);
    }
}
