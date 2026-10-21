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

import { LifecycleWrite } from "../../common/decorators/lifecycle-write.decorator";
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
    VoidInvoiceDto,
} from "./dto";
import { readInvoiceHistory } from "./invoice-events";
import {
    ChequeBouncedDto,
    ChequeClearedDto,
    RecordPaymentDto,
    RemovePaymentDto,
} from "./invoice-payments.dto";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoiceRemindersService } from "./invoice-reminders.service";
import { InvoiceSendService } from "./invoice-send.service";
import { BulkRemindersDto, ShareInvoiceDto } from "./invoice-share.dto";
import { InvoiceShareService } from "./invoice-share.service";
import { InvoiceSummaryService } from "./invoice-summary.service";
import { InvoicesService } from "./invoices.service";
import { payLinkUrlFor } from "./pay-link-url";

/**
 * Billing → Invoices (ADR-007). Invoicing needs no module (DEC-070): a
 * business creates, issues, sends, voids, credits and records an invoice
 * paid with Payments off, so these routes ask only for `invoice:*`, which
 * the service checks on every route.
 *
 * The one route that is Payments' is the pay link: a way to take money
 * online. It keeps its own Payments gate on the handler, and the guard reads
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
        private readonly payments: InvoicePaymentsService,
        private readonly summaries: InvoiceSummaryService,
        private readonly shares: InvoiceShareService,
        private readonly reminders: InvoiceRemindersService,
    ) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListInvoicesQueryDto,
    ) {
        return this.invoices.list(ctx, query);
    }

    /**
     * The money strip (DEC-173, U4): owed, overdue, paid this month,
     * drafts and cheques not in the bank, each with the filter it applies.
     * Counts only without `payment:read`. Before `:invoiceId`, as `owed`.
     */
    @Get("summary")
    summary(@OrgContext() ctx: OrganizationContext) {
        return this.summaries.summary(ctx);
    }

    /**
     * Remind many (DEC-173, U5): how each picked invoice's reminder would
     * go (email, WhatsApp, wait until tomorrow, or no way, with why). At
     * most 100. Before `:invoiceId`, like `summary`.
     */
    @Post("reminders/preview")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    remindersPreview(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: BulkRemindersDto,
    ) {
        return this.reminders.preview(ctx, dto);
    }

    /**
     * Send them: the email ones go now, each as `remind` sends it; the
     * WhatsApp ones are opened one at a time by the business, through
     * `POST :invoiceId/share`. Answers per invoice.
     */
    @Post("reminders")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    remindMany(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: BulkRemindersDto,
    ) {
        return this.reminders.send(ctx, dto);
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
     * Everything that happened to it, newest first, with who did it (U9
     * #1140): issued, sent, reminded (by hand or automatically), a send
     * that failed, voided, credited, written again, a failed pay attempt,
     * a new link, its shares and its payments. An older invoice reads its
     * own dates, without names. `invoice:read`; amounts need
     * `payment:read`.
     */
    @Get(":invoiceId/history")
    history(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ) {
        return readInvoiceHistory(ctx, id);
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
    @LifecycleWrite("wind-down")
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
    @LifecycleWrite("wind-down")
    @HttpCode(201)
    credit(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Body() dto: CreditInvoiceDto,
    ) {
        return this.invoices.credit(ctx, id, dto);
    }

    /**
     * The credit note "Cancel all of it" would issue (DEC-173, U13): its
     * likely number and amount, refused as the credit itself would be.
     */
    @Get(":invoiceId/credit-preview")
    creditPreview(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ) {
        return this.invoices.creditPreview(ctx, id);
    }

    /**
     * "Cancel and write a correct one" (DEC-173, U13): the credit note and
     * a draft with the same lines, in one transaction. Answers with both.
     */
    @Post(":invoiceId/credit-and-rewrite")
    @HttpCode(201)
    creditAndRewrite(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Body() dto: CreditInvoiceDto,
    ) {
        return this.invoices.creditAndRewrite(ctx, id, dto);
    }

    /** "Write again" on a void invoice nobody wrote again (U13); the draft. */
    @Post(":invoiceId/write-again")
    @HttpCode(201)
    writeAgain(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ) {
        return this.invoices.writeAgain(ctx, id);
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
    @LifecycleWrite("wind-down")
    @RequireModule("PAYMENTS")
    @IgnoreModuleReadiness()
    @HttpCode(201)
    @Header("Cache-Control", "no-store")
    async payLink(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ): Promise<{ url: string; payLinkMadeAt: string }> {
        const { token, payLinkCreatedAt } = await this.invoices.createPayLink(
            ctx,
            id,
        );
        return {
            url: await payLinkUrlFor(ctx.organizationId, token),
            payLinkMadeAt: payLinkCreatedAt.toISOString(),
        };
    }

    /**
     * Make a link that only shows the invoice (#833, DEC-070): no Pay
     * button, with "How to pay us". Not Payments': it takes no money, so
     * a business on any plan, with Payments off or no provider, can copy
     * it. Answered once, and it replaces any link out before it.
     */
    @Post(":invoiceId/view-link")
    @LifecycleWrite("wind-down")
    @HttpCode(201)
    @Header("Cache-Control", "no-store")
    async viewLink(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ): Promise<{ url: string; payLinkMadeAt: string }> {
        const { token, payLinkCreatedAt } = await this.invoices.createViewLink(
            ctx,
            id,
        );
        return {
            url: await payLinkUrlFor(ctx.organizationId, token),
            payLinkMadeAt: payLinkCreatedAt.toISOString(),
        };
    }

    /**
     * Send it with a fresh link through the business's own email provider
     * (D17): a pay link when it takes payment online, else a link to view
     * the invoice (DEC-070). The link is never in the answer: it goes only
     * to the customer.
     */
    @Post(":invoiceId/send")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    send(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ) {
        return this.sending.send(ctx, id);
    }

    /** The same, in reminder words; one a day, or 429 with the next time. */
    @Post(":invoiceId/remind")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    remind(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
    ) {
        return this.sending.remind(ctx, id);
    }

    /**
     * Share it by hand (DEC-173, U5): on WhatsApp (a fresh link and the
     * message, with the `wa.me` link to open; Saroh sends nothing), as a
     * link, a PDF or printed, each logged; or a receipt by email through
     * the business's own provider. A second WhatsApp reminder in a day is
     * a 429 with `retryAt`, as an email one is.
     */
    @Post(":invoiceId/share")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    share(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Body() dto: ShareInvoiceDto,
    ) {
        return this.shares.share(ctx, id, dto);
    }

    /**
     * Record a payment taken by hand (DEC-173): all that is left, or part
     * of it (`amount`), or a cheque, which counts as received while it
     * waits for the bank. More than is left is a 422 with `leftToPay`.
     * Answers with the invoice and `recorded.paymentId`, what Undo removes.
     */
    @Post(":invoiceId/payments")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    recordPayment(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Body() dto: RecordPaymentDto,
    ) {
        return this.payments.record(ctx, id, dto);
    }

    /**
     * Remove a payment recorded by mistake: soft, with a reason, kept in
     * the history; the invoice is owed again by what it paid. An online
     * payment is refunded instead (409).
     */
    @Delete(":invoiceId/payments/:paymentId")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    removePayment(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Param("paymentId") paymentId: string,
        @Body() dto: RemovePaymentDto,
    ) {
        return this.payments.remove(ctx, id, paymentId, dto);
    }

    /** A waiting cheque is in the bank. */
    @Post(":invoiceId/payments/:paymentId/cleared")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    chequeCleared(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Param("paymentId") paymentId: string,
        @Body() dto: ChequeClearedDto,
    ) {
        return this.payments.cleared(ctx, id, paymentId, dto);
    }

    /** A waiting cheque bounced: what it paid is owed again, no charge. */
    @Post(":invoiceId/payments/:paymentId/bounced")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    chequeBounced(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") id: string,
        @Param("paymentId") paymentId: string,
        @Body() dto: ChequeBouncedDto,
    ) {
        return this.payments.bounced(ctx, id, paymentId, dto);
    }
}
