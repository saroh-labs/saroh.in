import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import {
    loadInvoiceLogo,
    LOGO_READ_TIMEOUT_MS,
} from "../invoices/invoice-pdf-logo";
import { MediaService } from "../media/media.service";
import { QrCodesService } from "./qr-codes.service";
import type { QrPrintFormat, QrPrintLogo } from "./qr-print";
import {
    QR_PRINT_LOGO_PAPER,
    qrPrintFileName,
    QrPrintUnencodable,
    renderQrPrint,
} from "./qr-print";
import type { QrStyle } from "./qr-target";
import { QR_BRANDING_ROW } from "./qr-target";

/**
 * The response header that says what went in the code's centre box:
 * `image` (the business logo), `initials` (no logo, or one that can't be
 * printed, such as a WebP) or `none` (a plain code has no box). The screen
 * reads it to say why a logo is missing from the file.
 */
export const QR_PRINT_LOGO_HEADER = "X-Saroh-Qr-Logo";

/** A drawn print file: its bytes, the name it is saved under, its logo. */
export interface QrPrintDownload {
    file: Buffer;
    fileName: string;
    logo: QrPrintLogo;
}

/**
 * "Ready to print" in Settings › Share: one of a site's QR codes as a PDF
 * at real size (`qr-print.ts`), drawn on request and never stored.
 *
 * - Downloading a code's file is reading the site: `site:read`, scoped to
 *   the organization, so another business's site or code is a 404.
 * - Print files are part of the `qr-branding` catalogue row, for a plain
 *   code as much as a branded one; without it the refusal is the plan
 *   lock (403 `MODULE_LOCKED`).
 * - A retired code is a 409: it no longer opens what it was made for, so
 *   it is not something to put on new paper.
 * - A site with no Saroh address is a 409: the code has no link to hold.
 * - The file holds the code's short link on the Saroh address, never the
 *   custom domain (DEC-069), in the code's own style and colour.
 */
@Injectable()
export class QrPrintService {
    private readonly logger = new Logger(QrPrintService.name);

    constructor(
        private readonly codes: QrCodesService,
        private readonly media: MediaService,
    ) {}

    async print(
        ctx: OrganizationContext,
        siteId: string,
        qrCodeId: string,
        format: QrPrintFormat,
    ): Promise<QrPrintDownload> {
        const organizationId = ctx.organizationId;
        const { row, link } = await this.codes.stored(ctx, siteId, qrCodeId);
        await planMeter.assertIncluded(organizationId, QR_BRANDING_ROW);
        if (row.retiredAt) {
            throw new ConflictException({
                message: "This code is retired, so it can't be printed.",
                details: { reason: "retired" },
            });
        }
        if (!link) {
            throw new ConflictException({
                message:
                    "This site has no Saroh address yet, so the code has no link to print.",
                details: { reason: "no-address" },
            });
        }

        const branded = row.style === "BRANDED";
        const [organization, profile] = await Promise.all([
            prisma.organization.findUnique({
                where: { id: organizationId },
                select: { name: true },
            }),
            // Only a branded code has a box for the logo.
            branded
                ? prisma.businessProfile.findUnique({
                      where: { organizationId },
                      select: { logoUrl: true, logoMediaId: true },
                  })
                : null,
        ]);
        const logo = await loadInvoiceLogo(
            this.media,
            organizationId,
            profile,
            this.logger,
            LOGO_READ_TIMEOUT_MS,
            QR_PRINT_LOGO_PAPER,
        );
        const businessName = organization?.name ?? "";

        try {
            const drawn = await renderQrPrint({
                format,
                link,
                code: row.code,
                style: row.style as QrStyle,
                color: row.color,
                label: row.label,
                businessName,
                logo,
                organizationId,
            });
            return {
                file: drawn.file,
                fileName: qrPrintFileName(businessName, row.code, format),
                logo: drawn.logo,
            };
        } catch (error) {
            if (!(error instanceof QrPrintUnencodable)) throw error;
            // A short link is a few dozen characters; this is an address
            // setting gone wrong, not something the merchant did.
            throw new ConflictException({
                message: "This code's link is too long to print as a QR.",
                details: { reason: "unencodable" },
            });
        }
    }
}
