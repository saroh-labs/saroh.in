import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { MediaService } from "../media/media.service";
import { paperView } from "./invoice-paper-view";
import { pdfFileName, renderInvoicePdf } from "./invoice-pdf";
import { loadInvoiceLogo } from "./invoice-pdf-logo";
import type { InvoiceViewModel } from "./serialize";
import { INVOICE_DETAIL_SELECT, serializeInvoice } from "./serialize";

const DEFAULT_ZONE = "Asia/Kolkata";

/** A drawn paper: its bytes and the name it is saved under. */
export interface IssuedPdf {
    file: Buffer;
    fileName: string;
}

/**
 * Draw an issued invoice's paper (D16, default 37; DEC-083): the one PDF
 * every reader gets — the merchant's "Download PDF", the copy attached to
 * the invoice email, and the customer's download from the pay link and
 * their receipts. Drawn on request, never stored.
 *
 * The seller prints as it was at issue (DEC-082): `paperView` swaps in the
 * name, legal name and email frozen on the invoice, today's settings only
 * for a row without them. The business logo is today's (branding, not a
 * particular the law asks for), read from storage with a time and size
 * guard; a logo that cannot be read in time goes unprinted, never the PDF
 * (`invoice-pdf-logo.ts`). Only the business's own name and logo print:
 * no Saroh brand on the page.
 */
export async function drawPaperPdf(
    media: Pick<MediaService, "readReadyObjectStart">,
    organizationId: string,
    invoice: InvoiceViewModel & { number: string },
    logger: Pick<Logger, "warn">,
): Promise<IssuedPdf> {
    const [organization, profile] = await Promise.all([
        prisma.organization.findUnique({
            where: { id: organizationId },
            select: { name: true },
        }),
        prisma.businessProfile.findUnique({
            where: { organizationId },
            select: {
                legalName: true,
                contactEmail: true,
                timezone: true,
                logoUrl: true,
                logoMediaId: true,
            },
        }),
    ]);
    const logo = await loadInvoiceLogo(media, organizationId, profile, logger);
    const view = paperView(
        invoice,
        {
            name: organization?.name ?? "This business",
            legalName: profile?.legalName ?? null,
            email: profile?.contactEmail ?? null,
        },
        profile?.timezone ?? DEFAULT_ZONE,
    );
    return {
        file: await renderInvoicePdf(view, { logo, organizationId }),
        fileName: pdfFileName(invoice.number),
    };
}

/**
 * An issued invoice's PDF by its id, in `organizationId` — no caller and no
 * permission, so the caller has already decided this reader may have it
 * (the pay link's token, the customer's session, the send job). Null for
 * an invoice that isn't there, a draft (no number, no paper), and a void
 * one, which nobody is to be handed as a bill.
 */
@Injectable()
export class IssuedInvoicePdf {
    private readonly logger = new Logger(IssuedInvoicePdf.name);

    constructor(private readonly media: MediaService) {}

    async draw(
        organizationId: string,
        invoiceId: string,
    ): Promise<IssuedPdf | null> {
        const row = await prisma.invoice.findFirst({
            where: { id: invoiceId, organizationId },
            select: INVOICE_DETAIL_SELECT,
        });
        if (!row?.number || row.status === "DRAFT" || row.status === "VOID") {
            return null;
        }
        const invoice = serializeInvoice(row, new Date(), { detail: true });
        return drawPaperPdf(
            this.media,
            organizationId,
            { ...invoice, number: row.number },
            this.logger,
        );
    }
}
