import type { OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { ACCOUNT_THREAD_POSTER } from "../communications/account-thread";
import { CommunicationsModule } from "../communications/communications.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { MediaModule } from "../media/media.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { AccountThreadPosterService } from "../site-accounts/thread-poster";
import { GstRatesController } from "./gst-rates.controller";
import { GstRatesService } from "./gst-rates.service";
import { INVOICE_AUTO_SEND_TYPE } from "./invoice-auto-send";
import { InvoiceAutoSendHandler } from "./invoice-auto-send.handler";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { INVOICE_RECEIPT_TYPE } from "./invoice-receipt";
import { InvoiceReceiptHandler } from "./invoice-receipt.handler";
import { InvoiceRemindersService } from "./invoice-reminders.service";
import { InvoiceSendService } from "./invoice-send.service";
import { InvoiceShareService } from "./invoice-share.service";
import { InvoiceSummaryService } from "./invoice-summary.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

/**
 * Invoices a business issues (ADR-007). Exports the service so
 * subscriptions, courses and class packs can issue on their own transaction,
 * and the send service so Home's Send reminder reads the one send flag (F4).
 */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        CommunicationsModule,
        // Storage, for the business logo on the invoice PDF.
        MediaModule,
        // The receipt job's handler (DEC-173, U5).
        JobsModule,
    ],
    controllers: [InvoicesController, GstRatesController],
    providers: [
        InvoicesService,
        // The ledger: part payments, cheques, remove (DEC-173).
        InvoicePaymentsService,
        // The GST rates still to choose, and the save that chooses them.
        GstRatesService,
        InvoiceSendService,
        InvoicePdfService,
        // The money strip's one read (DEC-173, U4).
        InvoiceSummaryService,
        // Share by hand, Remind many, and the receipt job (DEC-173, U5).
        InvoiceShareService,
        InvoiceRemindersService,
        InvoiceReceiptHandler,
        // A renewal's invoice, sent by Saroh (automatic notices U10).
        InvoiceAutoSendHandler,
        OrganizationGuard,
        // The account thread's poster (A13). Still offered only while the
        // ACCOUNT_THREAD flag is on, which it is not by default.
        {
            provide: ACCOUNT_THREAD_POSTER,
            useClass: AccountThreadPosterService,
        },
    ],
    // The send service too: Home's Send reminder reads its send flag (F4).
    exports: [InvoicesService, InvoiceSendService],
})
export class InvoicesModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly receipts: InvoiceReceiptHandler,
        private readonly autoSend: InvoiceAutoSendHandler,
    ) {}

    onModuleInit(): void {
        // Every recorded payment's receipt, after the Undo window (DEC-173).
        this.registry.register(INVOICE_RECEIPT_TYPE, this.receipts.handle);
        // A membership's renewal invoice, sent as it is made (DEC-174 R3).
        this.registry.register(INVOICE_AUTO_SEND_TYPE, this.autoSend.handle);
    }
}
