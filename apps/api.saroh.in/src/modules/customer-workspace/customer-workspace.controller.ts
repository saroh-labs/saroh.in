import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsString, MinLength } from "class-validator";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AccountUnlinkService } from "../site-accounts/account-unlink.service";
import { ContactAttentionService } from "./contact-attention.service";
import { ContactNotesService } from "./contact-notes.service";
import { CustomerDetailService } from "./customer-detail.service";
import { CustomerWorkspaceService } from "./customer-workspace.service";
import {
    ListCustomersQueryDto,
    ListUnlinkedQueryDto,
} from "./customers-list.dto";
import { CustomersListService } from "./customers-list.service";
import {
    ConfirmAttentionDto,
    ContactNoteDto,
    CreateAttentionDto,
    UpdateAttentionDto,
} from "./dto";
import { MergeContactsDto, MergePreviewQueryDto } from "./merge.dto";
import { MergeService } from "./merge.service";

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
        private readonly attention: ContactAttentionService,
        private readonly customers: CustomersListService,
        private readonly accounts: AccountUnlinkService,
        private readonly merges: MergeService,
    ) {}

    /**
     * The business's customers (DEC-041, C3): everyone who has paid or signs
     * in on its site, with search, chips and counts, sort, "Bought at" and
     * pages of 50.
     */
    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListCustomersQueryDto,
    ) {
        return this.customers.list(ctx, query);
    }

    /** Paying store customers no contact holds yet, for the review sheet. */
    @Get("unlinked")
    unlinked(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListUnlinkedQueryDto,
    ) {
        return this.customers.unlinked(ctx, query);
    }

    /**
     * What merging two customers would do (DEC-042, C9): what moves, the
     * name, email and phone to pick from, consent per channel, the site
     * account's outcome, and anything that refuses it.
     */
    @Get(":contactId/merge/:otherId/preview")
    mergePreview(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Param("otherId") otherId: string,
        @Query() query: MergePreviewQueryDto,
    ) {
        return this.merges.preview(ctx, contactId, otherId, query.survivorId);
    }

    /** Merge two customers into the one kept (DEC-042, C9). Final. */
    @Post(":contactId/merge/:otherId")
    @HttpCode(200)
    merge(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Param("otherId") otherId: string,
        @Body() dto: MergeContactsDto,
    ) {
        return this.merges.merge(ctx, contactId, otherId, dto);
    }

    /**
     * One read of a customer, rooted on the contact (U8). A merged-away
     * contact answers `{ mergedInto }`, and the page goes to the survivor.
     */
    @Get(":contactId/detail")
    detail(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ) {
        return this.details.read(ctx, contactId);
    }

    /** What "This isn't them" would move with the site account (A4). */
    @Get(":contactId/account/unlink")
    unlinkAccountPreview(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ) {
        return this.accounts.preview(ctx, contactId);
    }

    /** "This isn't them": the site account leaves this contact (A4). */
    @Post(":contactId/account/unlink")
    @HttpCode(200)
    unlinkAccount(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ) {
        return this.accounts.unlink(ctx, contactId);
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

    /**
     * Needs attention (DEC-040, C1): the entries this viewer may see, how
     * many sensitive ones they can't, and suggestions for those who can add
     * them.
     */
    @Get(":contactId/attention")
    listAttention(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ) {
        return this.attention.list(ctx, contactId);
    }

    @Post(":contactId/attention")
    @HttpCode(201)
    createAttention(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Body() dto: CreateAttentionDto,
    ) {
        return this.attention.create(ctx, contactId, dto);
    }

    @Patch(":contactId/attention/:entryId")
    updateAttention(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Param("entryId") entryId: string,
        @Body() dto: UpdateAttentionDto,
    ) {
        return this.attention.update(ctx, contactId, entryId, dto);
    }

    @Delete(":contactId/attention/:entryId")
    async removeAttention(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Param("entryId") entryId: string,
    ) {
        await this.attention.remove(ctx, contactId, entryId);
        return { ok: true };
    }

    /**
     * "Add to Needs attention" on a suggestion, with the kind, label and
     * sensitive tick the confirm card settled on (C12). No body adds it as
     * it stands.
     */
    @Post(":contactId/attention/:entryId/confirm")
    @HttpCode(200)
    confirmAttention(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Param("entryId") entryId: string,
        @Body() dto: ConfirmAttentionDto,
    ) {
        return this.attention.confirm(ctx, contactId, entryId, dto);
    }

    /** Which contact a store customer is linked to (U18), or null. */
    @Get("links/by-customer/:customerId")
    contactFor(
        @OrgContext() ctx: OrganizationContext,
        @Param("customerId") customerId: string,
    ) {
        return this.workspace.contactFor(ctx, customerId);
    }

    @Get(":contactId/timeline")
    timeline(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ) {
        return this.workspace.timeline(ctx, contactId);
    }

    /**
     * Store customers to link, and with `?include=contacts` other contacts
     * who are likely the same person (C2). Each item says its `kind`.
     */
    @Get(":contactId/suggestions")
    suggestions(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Query("include") include?: string,
    ) {
        return this.workspace.suggestLinks(ctx, contactId, {
            includeContacts: include === "contacts",
        });
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
