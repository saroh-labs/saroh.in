import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { outsideOrgContext, prisma } from "@saroh/database";

import { businessForHost, reportHost } from "./report-host";

export interface SubmitBusinessReportInput {
    /** The website address as the customer typed it. */
    site: string;
    message: string;
    email?: string;
    /** A digest of the reporter's address; never the address itself. */
    ipHash?: string;
}

/**
 * Reports customers send at saroh.in/customers about a business that uses
 * Saroh (Terms rev 46: the business is responsible for its sales; Saroh may
 * suspend an account used for fraud or to harm customers).
 *
 * Write-only from the public side: an anonymous caller can add a report and
 * learn nothing back — not whether the address is a Saroh site, nor which
 * business it is — so the form can't be used to look businesses up. Staff
 * read and close reports in the admin console (`AdminBusinessReportsService`).
 * Nothing is emailed yet.
 */
@Injectable()
export class BusinessReportsService {
    private readonly logger = new Logger(BusinessReportsService.name);

    async submit(input: SubmitBusinessReportInput): Promise<{ ok: true }> {
        const siteHost = reportHost(input.site);
        if (!siteHost) {
            throw new BadRequestException(
                "Enter the business's website address, like shop.example.com.",
            );
        }
        const organizationId = await businessForHost(siteHost);
        await outsideOrgContext(() =>
            prisma.businessReport.create({
                data: {
                    organizationId,
                    siteHost,
                    message: input.message.trim(),
                    reporterEmail: input.email ?? null,
                    ipHash: input.ipHash ?? null,
                },
                select: { id: true },
            }),
        );
        // The host only: the message and the email are the reporter's.
        this.logger.log(
            `business report: ${siteHost}${organizationId ? "" : " (not a Saroh site)"}`,
        );
        return { ok: true };
    }
}
