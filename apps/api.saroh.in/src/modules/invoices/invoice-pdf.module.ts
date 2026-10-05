import { Module } from "@nestjs/common";

import { MediaStorageModule } from "../media/media-storage.module";
import { IssuedInvoicePdf } from "./issued-invoice-pdf";

/**
 * The issued invoice's PDF drawer on its own (DEC-083), so the readers
 * outside invoices — the public pay link, the customer's receipts and the
 * invoice email's send job — can draw it without importing the invoices
 * module, which already imports communications. Needs only storage, for
 * the business logo.
 */
@Module({
    imports: [MediaStorageModule],
    providers: [IssuedInvoicePdf],
    exports: [IssuedInvoicePdf],
})
export class InvoicePdfModule {}
