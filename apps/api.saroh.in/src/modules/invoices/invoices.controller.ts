import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import {
    IgnoreModuleReadiness,
    RequireModule,
} from "../capabilities/require-module.decorator";
import {
    InvoiceInputDto,
    ListInvoicesQueryDto,
    OwedQueryDto,
    RecordPaymentDto,
    VoidInvoiceDto,
} from "./dto";
import { InvoicesService } from "./invoices.service";
import { payLinkUrl } from "./pay-link-url";

/**
 * Billing → Invoices (ADR-007). Under Payments, which a business can switch
 * on without connecting a provider: an invoice paid in cash or by UPI is
 * recorded by hand, so the "no provider connected" setup blocker must not
 * refuse these routes — the module being on is enough.
 *
 * Authorization is in the service, which every route passes the context to.
 */
@Controller("organizations/:organizationId/invoices")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("PAYMENTS")
@IgnoreModuleReadiness()
export class InvoicesController {
    constructor(private readonly invoices: InvoicesService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListInvoicesQueryDto,
    ) {
        return this.invoices.list(ctx, query);
    }

    /** Declared before `:invoiceId`, or "owed" would be read as an id. */
    @Get("owed")
    owed(@OrgContext() ctx: OrganizationContext, @Query() query: OwedQueryDto) {
        return this.invoices.owed(ctx, query);
    }

    @Get(":invoiceId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ) {
        return this.invoices.get(ctx, id);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: InvoiceInputDto,
    ) {
        return this.invoices.createDraft(ctx, dto);
    }

    @Patch(":invoiceId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Body() dto: InvoiceInputDto,
    ) {
        return this.invoices.updateDraft(ctx, id, dto);
    }

    @Delete(":invoiceId")
    @HttpCode(204)
    async remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ): Promise<void> {
        await this.invoices.deleteDraft(ctx, id);
    }

    @Post(":invoiceId/issue")
    @HttpCode(200)
    issue(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ) {
        return this.invoices.issue(ctx, id);
    }

    @Post(":invoiceId/void")
    @HttpCode(200)
    voidInvoice(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Body() dto: VoidInvoiceDto,
    ) {
        return this.invoices.voidInvoice(ctx, id, dto);
    }

    /** Void it and open a corrected draft; answers with the new draft. */
    @Post(":invoiceId/reissue")
    @HttpCode(201)
    reissue(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Body() dto: VoidInvoiceDto,
    ) {
        return this.invoices.reissue(ctx, id, dto);
    }

    /**
     * Make the invoice's pay link and answer with it — once: only its hash
     * is kept, so asking again makes a new link and retires the old one.
     */
    @Post(":invoiceId/pay-link")
    @HttpCode(201)
    @Header("Cache-Control", "no-store")
    async payLink(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ): Promise<{ url: string }> {
        const { token } = await this.invoices.createPayLink(ctx, id);
        return { url: payLinkUrl(token) };
    }

    @Post(":invoiceId/payments")
    @HttpCode(200)
    recordPayment(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Body() dto: RecordPaymentDto,
    ) {
        return this.invoices.recordPayment(ctx, id, dto);
    }
}
