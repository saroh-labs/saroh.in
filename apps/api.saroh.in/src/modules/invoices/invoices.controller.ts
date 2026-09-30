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
    StreamableFile,
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
    CreditInvoiceDto,
    InvoiceInputDto,
    ListInvoicesQueryDto,
    OwedQueryDto,
    RecordPaymentDto,
    VoidInvoiceDto,
} from "./dto";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoiceSendService } from "./invoice-send.service";
import { InvoicesService } from "./invoices.service";
import { payLinkUrl } from "./pay-link-url";

/**
 * Billing → Invoices (ADR-007). Invoicing needs no module (DEC-070): a
 * business creates, issues, sends, voids, credits and records an invoice
 * paid with Payments off, so these routes ask only for `invoice:*`, which
 * the service checks on every route.
 *
 * The one route that is Payments' is the pay link: a way to take money
 * online. It keeps its own `@RequireModule("PAYMENTS")`, and the guard reads
 * a handler's metadata before the class's. It still skips the "no provider
 * connected" readiness blocker, so the service can say what the link needs.
 */
@Controller("organizations/:organizationId/invoices")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
export class InvoicesController {
    constructor(
        private readonly invoices: InvoicesService,
        private readonly sending: InvoiceSendService,
        private readonly pdfs: InvoicePdfService,
    ) {}

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

    /** With the send flag (D17): which channels can carry it, and what went. */
    @Get(":invoiceId")
    async get(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ) {
        const invoice = await this.invoices.get(ctx, id);
        return {
            ...invoice,
            ...(await this.sending.readFor(ctx.organizationId, id)),
        };
    }

    /**
     * The issued paper as a PDF, named for its number (D16). Drawn on
     * request and never stored; a draft is a 409.
     */
    @Get(":invoiceId/pdf")
    @Header("Cache-Control", "no-store")
    async pdf(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ): Promise<StreamableFile> {
        const { file, fileName } = await this.pdfs.render(ctx, id);
        return new StreamableFile(file, {
            type: "application/pdf",
            disposition: `attachment; filename="${fileName}"`,
            length: file.length,
        });
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

    /**
     * Cancel an issued invoice with a credit note for all of it (ADR-008) —
     * how a GST-registered business corrects one. Answers with the credit
     * note.
     */
    @Post(":invoiceId/credit")
    @HttpCode(201)
    credit(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Body() dto: CreditInvoiceDto,
    ) {
        return this.invoices.credit(ctx, id, dto);
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
    @RequireModule("PAYMENTS")
    @IgnoreModuleReadiness()
    @HttpCode(201)
    @Header("Cache-Control", "no-store")
    async payLink(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ): Promise<{ url: string }> {
        const { token } = await this.invoices.createPayLink(ctx, id);
        return { url: payLinkUrl(token) };
    }

    /**
     * Send it with a fresh link through the business's own email provider
     * (D17): a pay link when it takes payment online, else a link to view
     * the invoice (DEC-070). The link is never in the answer: it goes only
     * to the customer.
     */
    @Post(":invoiceId/send")
    @HttpCode(200)
    send(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ) {
        return this.sending.send(ctx, id);
    }

    /** The same, in reminder words; one a day, or 429 with the next time. */
    @Post(":invoiceId/remind")
    @HttpCode(200)
    remind(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ) {
        return this.sending.remind(ctx, id);
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
