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
import { Transform } from "class-transformer";
import { IsString, MinLength } from "class-validator";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactNotesService } from "./contact-notes.service";
import { CustomerDetailService } from "./customer-detail.service";
import { CustomerWorkspaceService } from "./customer-workspace.service";
import { ContactNoteDto } from "./dto";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

class LinkCustomerDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "customerId is required" })
    customerId!: string;
}

/**
 * Unified customer workspace API (#120). A person's cross-module history and
 * the explicit, reversible identity links that connect their CRM Contact and
 * commerce Customer records. Double-guarded; reads/links respect the actor's
 * role and are Organization-scoped (a link can never cross Organizations).
 */
@Controller("organizations/:organizationId/customers")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class CustomerWorkspaceController {
    constructor(
        private readonly workspace: CustomerWorkspaceService,
        private readonly details: CustomerDetailService,
        private readonly notes: ContactNotesService,
    ) {}

    /** One read of a customer, rooted on the contact (U8). */
    @Get(":contactId/detail")
    detail(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ) {
        return this.details.detail(ctx, contactId);
    }

    @Post(":contactId/notes")
    @HttpCode(201)
    createNote(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Body() dto: ContactNoteDto,
    ) {
        return this.notes.create(ctx, contactId, dto);
    }

    @Patch(":contactId/notes/:noteId")
    updateNote(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Param("noteId") noteId: string,
        @Body() dto: ContactNoteDto,
    ) {
        return this.notes.update(ctx, contactId, noteId, dto);
    }

    @Delete(":contactId/notes/:noteId")
    async removeNote(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Param("noteId") noteId: string,
    ) {
        await this.notes.remove(ctx, contactId, noteId);
        return { ok: true };
    }

    @Get(":contactId/timeline")
    timeline(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ) {
        return this.workspace.timeline(ctx, contactId);
    }

    @Get(":contactId/suggestions")
    suggestions(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ) {
        return this.workspace.suggestLinks(ctx, contactId);
    }

    @Post(":contactId/links")
    @HttpCode(201)
    async link(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Body() dto: LinkCustomerDto,
    ) {
        await this.workspace.link(ctx, contactId, dto.customerId);
        return { ok: true };
    }

    @Delete("links/:linkId")
    async unlink(
        @OrgContext() ctx: OrganizationContext,
        @Param("linkId") linkId: string,
    ) {
        await this.workspace.unlink(ctx, linkId);
        return { ok: true };
    }
}
