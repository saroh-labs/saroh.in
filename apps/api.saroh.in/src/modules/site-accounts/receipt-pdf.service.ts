import { Injectable, NotFoundException } from "@nestjs/common";

import type { IssuedPdf } from "../invoices/issued-invoice-pdf";
import { IssuedInvoicePdf } from "../invoices/issued-invoice-pdf";
import { ownReceiptId } from "./account-home.service";
import type { CustomerContext } from "./customer-context.decorator";

/**
 * "Download PDF" on a receipt in the customer's account area (DEC-083):
 * the same paper the merchant downloads, drawn on request and never
 * stored. Authorised exactly as the receipt's read is — the signed-in
 * customer's own paid invoice ({@link ownReceiptId}); anyone else's is a
 * 404.
 */
@Injectable()
export class ReceiptPdfService {
    constructor(private readonly pdfs: IssuedInvoicePdf) {}

    async pdf(
        ctx: Pick<
            CustomerContext,
            "organizationId" | "contactId" | "accountId"
        >,
        invoiceId: string,
    ): Promise<IssuedPdf> {
        const id = await ownReceiptId(ctx, invoiceId);
        const pdf = await this.pdfs.draw(ctx.organizationId, id);
        if (!pdf) throw new NotFoundException();
        return pdf;
    }
}
