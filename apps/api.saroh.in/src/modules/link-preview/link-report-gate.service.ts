import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendLinkReportEmail } from "../../common/email";
import { prismaErrorCode } from "../../common/prisma-errors";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import {
    LINK_PREVIEW_SOURCE,
    maskEmail,
    normaliseEmail,
} from "../waitlist/waitlist-keys";
import type { LinkFailure } from "./link-preview.service";
import { LinkPreviewService } from "./link-preview.service";
import type { Fix } from "./link-report";
import { reportSubject, reportText } from "./report-email";

/**
 * The link preview tool's email gate (resources plan U2, KTD-5).
 *
 * An email unlocks the fix-it report. It is kept in the waitlist's store
 * (one list, one consent line, one way to leave): a new entry with source
 * `link-preview`; on an entry the address already has, only the link
 * checked, when, and a newly ticked consent. "Also send me Saroh news" is
 * stored as ticked — and an untick never clears an earlier yes, which is
 * withdrawn by asking (Privacy).
 *
 * The report is emailed once per unlock, at most {@link EMAILS_PER_DAY}
 * times a day to one address: past that the page still unlocks and says no
 * copy went, so nobody can use the tool to fill a stranger's inbox.
 */

export const EMAILS_PER_DAY = 3;

/** The waitlist's own key for an entry with no business named. */
const NO_BUSINESS = "";

export type UnlockResult =
    | {
          unlocked: true;
          /** `sent`: a copy left. `limited`: this address had its copies today. `not-sent`: mail is down. */
          emailed: "sent" | "limited" | "not-sent";
          fixes: Fix[];
          suggestedTags: string;
      }
    | { unlocked: false; failure: LinkFailure };

@Injectable()
export class LinkReportGateService {
    private readonly logger = new Logger(LinkReportGateService.name);
    private readonly perEmail = new FixedWindowRateLimiter(
        EMAILS_PER_DAY,
        24 * 60 * 60 * 1000,
    );

    constructor(private readonly preview: LinkPreviewService) {}

    async unlock(input: {
        email: string;
        url: string;
        consent: boolean;
        ipHash?: string;
    }): Promise<UnlockResult> {
        const check = await this.preview.check(input.url);
        if (!check.ok) return { unlocked: false, failure: check.failure };

        const { email, key } = normaliseEmail(input.email);
        await this.store({
            email,
            emailKey: key,
            checkedUrl: check.url,
            consent: input.consent,
            ipHash: input.ipHash,
        });

        let emailed: "sent" | "limited" | "not-sent" = "limited";
        if (this.perEmail.take(key)) {
            const outcome = await sendLinkReportEmail(
                email,
                reportSubject(check.facts),
                reportText(check.facts, check.report, input.consent, check.url),
            );
            emailed = outcome === "sent" ? "sent" : "not-sent";
            if (outcome !== "sent") {
                this.logger.warn(
                    `link preview: report to ${maskEmail(email)} not sent (${outcome})`,
                );
            }
        }
        return {
            unlocked: true,
            emailed,
            fixes: check.report.fixes,
            suggestedTags: check.report.suggestedTags,
        };
    }

    private async store(row: {
        email: string;
        emailKey: string;
        checkedUrl: string;
        consent: boolean;
        ipHash?: string;
    }): Promise<void> {
        const where = {
            emailKey_businessKey: {
                emailKey: row.emailKey,
                businessKey: NO_BUSINESS,
            },
        };
        const update = {
            checkedUrl: row.checkedUrl,
            checkedAt: new Date(),
            ...(row.consent && { newsConsent: true }),
        };
        const existing = await prisma.waitlistSignup.findUnique({
            where,
            select: { id: true },
        });
        if (existing) {
            await prisma.waitlistSignup.update({ where, data: update });
            return;
        }
        try {
            await prisma.waitlistSignup.create({
                data: {
                    email: row.email,
                    emailKey: row.emailKey,
                    businessKey: NO_BUSINESS,
                    source: LINK_PREVIEW_SOURCE,
                    checkedUrl: row.checkedUrl,
                    checkedAt: update.checkedAt,
                    newsConsent: row.consent,
                    ipHash: row.ipHash ?? null,
                },
                select: { id: true },
            });
            this.logger.log(
                `link preview: new report email ${maskEmail(row.email)}`,
            );
        } catch (error) {
            // Two unlocks at once: the other one made the entry.
            if (prismaErrorCode(error) !== "P2002") throw error;
            await prisma.waitlistSignup.update({ where, data: update });
        }
    }
}
