import { ConflictException, Injectable, Logger } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { MediaService } from "../media/media.service";
import { InvoicesService } from "./invoices.service";
import type { IssuedPdf } from "./issued-invoice-pdf";
import { drawPaperPdf } from "./issued-invoice-pdf";

/**
 * "Download PDF" on Invoice Detail (D16, default 37): an issued invoice's
 * paper, drawn on request and never stored. The customer gets the same
 * PDF, attached to the invoice email and from the pay link and their
 * receipts (DEC-083, which supersedes default 106).
 *
 * Reading it is reading the invoice: `invoice:read`, scoped to the
 * organization, so another business's invoice is a 404. A draft has no
 * number and no paper yet, so it is a 409.
 *
 * The seller prints as it was at issue (DEC-082) and the logo as it is
 * today; `drawPaperPdf` (`issued-invoice-pdf.ts`) draws it.
 */
@Injectable()
export class InvoicePdfService {
    private readonly logger = new Logger(InvoicePdfService.name);

    constructor(
        private readonly invoices: InvoicesService,
        private readonly media: MediaService,
    ) {}

    async render(
        ctx: OrganizationContext,
        invoiceId: string,
    ): Promise<IssuedPdf> {
        const invoice = await this.invoices.get(ctx, invoiceId);
        const number = invoice.number;
        if (invoice.status === "DRAFT" || !number) {
            throw new ConflictException(
                "A draft has no PDF yet. Issue it first.",
            );
        }
        return drawPaperPdf(
            this.media,
            ctx.organizationId,
            { ...invoice, number },
            this.logger,
        );
    }
}
