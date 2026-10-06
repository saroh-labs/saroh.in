import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    StreamableFile,
    UseGuards,
} from "@nestjs/common";

import type { PublicInvoiceView } from "../payments/public-invoices.service";
import { AccountAreaGuard } from "./account-area";
import { AccountHomeService } from "./account-home.service";
import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import { CustomerSessionGuard } from "./customer-session.guard";
import type {
    AccountHome,
    AccountNote,
    AccountReceipt,
    AccountView,
} from "./customer-view";
import {
    AddNoteDto,
    ChangeEmailCodeDto,
    ChangeEmailDto,
    UpdateDetailsDto,
} from "./dto";
import type { EmailChanged } from "./email-change.service";
import { EmailChangeService } from "./email-change.service";
import { ReceiptPdfService } from "./receipt-pdf.service";
import type { CodeRequested } from "./sign-in-codes.service";
import type { SiteRelay } from "./site-relay";
import { RelayContext } from "./site-relay";

/**
 * The customer account area on a merchant's site (round-2 plan A, A5;
 * ADR-011): Me, Home, receipts and health notes, mounted at
 * `/public/site-accounts/me`.
 *
 * Behind {@link AccountAreaGuard} first — every route is a 404 until
 * `SITE_ACCOUNT_AREA=on` — then {@link CustomerSessionGuard}: the site's
 * signed relay and a live session for that very site, so every read is the
 * signed-in customer's own, in their business's RLS context. The site's
 * server calls these; a browser never does. Every answer is built by
 * `customer-view.ts`.
 */
@Controller("public/site-accounts/me")
@UseGuards(AccountAreaGuard, CustomerSessionGuard)
export class AccountController {
    constructor(
        private readonly account: AccountHomeService,
        private readonly emailChange: EmailChangeService,
        private readonly receiptPdfs: ReceiptPdfService,
    ) {}

    /** Who is signed in, their details, and the tabs this business shows. */
    @Get()
    @Header("Cache-Control", "no-store")
    me(@CurrentCustomer() customer: CustomerContext): Promise<AccountView> {
        return this.account.me(customer);
    }

    /** Change the name or the phone (default 75). */
    @Patch()
    @Header("Cache-Control", "no-store")
    update(
        @CurrentCustomer() customer: CustomerContext,
        @Body() dto: UpdateDetailsDto,
    ): Promise<AccountView> {
        return this.account.updateDetails(customer, dto);
    }

    /** Home: each block read on its own; a failed one says so. */
    @Get("home")
    @Header("Cache-Control", "no-store")
    home(@CurrentCustomer() customer: CustomerContext): Promise<AccountHome> {
        return this.account.home(customer);
    }

    /** Send a code to a new sign-in email. Answers as `codes` does. */
    @Post("email/code")
    @HttpCode(HttpStatus.ACCEPTED)
    @Header("Cache-Control", "no-store")
    requestEmailCode(
        @CurrentCustomer() customer: CustomerContext,
        @RelayContext() relay: SiteRelay,
        @Body() dto: ChangeEmailCodeDto,
    ): Promise<CodeRequested> {
        return this.emailChange.requestCode(customer, relay, dto);
    }

    /** Change the sign-in email with its code: the same answer every time. */
    @Post("email")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    changeEmail(
        @CurrentCustomer() customer: CustomerContext,
        @RelayContext() relay: SiteRelay,
        @Body() dto: ChangeEmailDto,
    ): Promise<EmailChanged> {
        return this.emailChange.confirm(customer, relay, dto);
    }

    /** Paid invoices, for Me's Receipts. */
    @Get("receipts")
    @Header("Cache-Control", "no-store")
    receipts(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<AccountReceipt[]> {
        return this.account.receipts(customer);
    }

    /** One receipt, as the pay link's paper. Another person's is a 404. */
    @Get("receipts/:invoiceId")
    @Header("Cache-Control", "no-store")
    receipt(
        @CurrentCustomer() customer: CustomerContext,
        @Param("invoiceId") invoiceId: string,
    ): Promise<PublicInvoiceView> {
        return this.account.receipt(customer, invoiceId);
    }

    /**
     * One receipt as a PDF (DEC-083), named for its number: the issued
     * paper, drawn on request and never stored. Another person's is a 404.
     */
    @Get("receipts/:invoiceId/pdf")
    @Header("Cache-Control", "private, no-store")
    @Header("X-Content-Type-Options", "nosniff")
    async receiptPdf(
        @CurrentCustomer() customer: CustomerContext,
        @Param("invoiceId") invoiceId: string,
    ): Promise<StreamableFile> {
        const { file, fileName } = await this.receiptPdfs.pdf(
            customer,
            invoiceId,
        );
        return new StreamableFile(file, {
            type: "application/pdf",
            disposition: `attachment; filename="${fileName}"`,
            length: file.length,
        });
    }

    /** The health notes this customer sent (404 until C12). */
    @Get("notes")
    @Header("Cache-Control", "no-store")
    notes(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<AccountNote[]> {
        return this.account.notes(customer);
    }

    /** Send the team a health note, as a suggestion (404 until C12). */
    @Post("notes")
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    addNote(
        @CurrentCustomer() customer: CustomerContext,
        @Body() dto: AddNoteDto,
    ): Promise<AccountNote> {
        return this.account.addNote(customer, dto);
    }
}
