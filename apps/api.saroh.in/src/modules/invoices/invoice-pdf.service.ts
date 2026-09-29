import { ConflictException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { paperView } from "./invoice-paper-view";
import { pdfFileName, renderInvoicePdf } from "./invoice-pdf";
import { InvoicesService } from "./invoices.service";

const DEFAULT_ZONE = "Asia/Kolkata";

/**
 * "Download PDF" on Invoice Detail (D16, default 37): an issued invoice's
 * paper, drawn on request and never stored. Only the merchant's side has
 * one — the pay page keeps no PDF (default 106).
 *
 * Reading it is reading the invoice: `invoice:read`, scoped to the
 * organization, so another business's invoice is a 404. A draft has no
 * number and no paper yet, so it is a 409.
 */
@Injectable()
export class InvoicePdfService {
    constructor(private readonly invoices: InvoicesService) {}

    async render(
        ctx: OrganizationContext,
        invoiceId: string,
    ): Promise<{ file: Buffer; fileName: string }> {
        const invoice = await this.invoices.get(ctx, invoiceId);
        const number = invoice.number;
        if (invoice.status === "DRAFT" || !number) {
            throw new ConflictException(
                "A draft has no PDF yet. Issue it first.",
            );
        }
        const [organization, profile] = await Promise.all([
            prisma.organization.findUnique({
                where: { id: ctx.organizationId },
                select: { name: true },
            }),
            prisma.businessProfile.findUnique({
                where: { organizationId: ctx.organizationId },
                select: { legalName: true, contactEmail: true, timezone: true },
            }),
        ]);
        const view = paperView(
            { ...invoice, number },
            {
                name: organization?.name ?? "This business",
                legalName: profile?.legalName ?? null,
                email: profile?.contactEmail ?? null,
            },
            profile?.timezone ?? DEFAULT_ZONE,
        );
        return {
            file: await renderInvoicePdf(view),
            fileName: pdfFileName(number),
        };
    }
}
