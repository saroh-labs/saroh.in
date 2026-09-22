import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { ContactsService } from "./contacts.service";
import { CreateContactDto, UpdateContactDto } from "./dto";

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
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("CRM")
export class ContactsController {
    constructor(private readonly contacts: ContactsService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        return this.contacts.list(ctx);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateContactDto,
    ) {
        return this.contacts.create(ctx, dto);
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

    @Delete(":contactId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ): Promise<{ id: string; deleted: true; leads: number }> {
        return this.contacts.remove(ctx, contactId);
    }
}
