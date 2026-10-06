import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendLinkReportEmail } from "../../common/email";
import { prismaErrorCode } from "../../common/prisma-errors";
import {
    LINK_PREVIEW_SOURCE,
    maskEmail,
    normaliseEmail,
} from "../waitlist/waitlist-keys";
import type { LinkFailure } from "./link-preview.service";
import { LinkPreviewService } from "./link-preview.service";
import type { Fix } from "./link-report";
import { REPORT_SUBJECT, reportText } from "./report-email";

/**
 * The link preview tool's email gate (resources plan U2, KTD-5).
 *
 * An email unlocks the fix-it report. It is kept in the waitlist's store
 * (Privacy: the email and the link checked, 12 months): a new entry with
 * source `link-preview`; on an entry the address already has, only the link
 * checked and when — nothing else of that entry changes. The link is kept
 * as its origin and path, never its query string.
 *
 * No marketing consent is taken here: anyone can type anyone's address, so
 * an unverified address can't say yes to news (security review, 5 Oct
 * 2026). `newsConsent` is false on the entries this makes and never set.
 *
 * The emailed copy is our own words only (`report-email.ts`). Both caps on
 * it are counted in the database, so a restart or a second API process
 * doesn't reset them: at most {@link EMAILS_PER_DAY} copies to one address
 * per UTC day, and at most {@link REPORT_EMAILS_PER_DAY} copies in all. Past
 * either, the page still unlocks and says no copy went.
 */

export const EMAILS_PER_DAY = 3;
/** Every report email the tool sends in one UTC day, to anyone. */
export const REPORT_EMAILS_PER_DAY = 300;

/** The waitlist's own key for an entry with no business named. */
const NO_BUSINESS = "";

export type UnlockResult =
    | {
          unlocked: true;
          /**
           * `sent`: a copy left. `limited`: this address had its copies
           * today. `not-sent`: no copy went — mail is down, or the tool has
           * sent all it sends today.
           */
          emailed: "sent" | "limited" | "not-sent";
          fixes: Fix[];
          suggestedTags: string;
      }
    | { unlocked: false; failure: LinkFailure };

/** The address as stored: origin and path, no query string or fragment. */
export function storedLink(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return url.split(/[?#]/)[0] ?? "";
    }
}

/** The UTC day `now` falls on, as a DATE column holds it. */
export function utcDay(now: Date): Date {
    return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
}

@Injectable()
export class LinkReportGateService {
    private readonly logger = new Logger(LinkReportGateService.name);

    constructor(private readonly preview: LinkPreviewService) {}

    async unlock(input: {
        email: string;
        url: string;
        ipHash?: string;
        now?: Date;
    }): Promise<UnlockResult> {
        const check = await this.preview.check(input.url);
        if (!check.ok) return { unlocked: false, failure: check.failure };

        const now = input.now ?? new Date();
        const link = storedLink(check.url);
        const { email, key } = normaliseEmail(input.email);
        const id = await this.store({
            email,
            emailKey: key,
            checkedUrl: link,
            checkedAt: now,
            ipHash: input.ipHash,
        });

        let emailed: "sent" | "limited" | "not-sent";
        const claim = await this.claimEmail(id, utcDay(now));
        if (claim === "address") {
            emailed = "limited";
        } else if (claim === "day") {
            emailed = "not-sent";
            this.logger.warn(
                `link preview: the day's ${REPORT_EMAILS_PER_DAY} report emails are spent; no copy to ${maskEmail(email)}`,
            );
        } else {
            const outcome = await sendLinkReportEmail(
                email,
                REPORT_SUBJECT,
                reportText(check.report, link),
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

    /**
     * Take one of today's copies for this entry: `ok`, or which cap is
     * spent. The day's total is a sum, so two unlocks at the very edge may
     * both pass it; the per-address count is a conditional update, so it
     * never goes past {@link EMAILS_PER_DAY}.
     */
    private async claimEmail(
        id: string,
        day: Date,
    ): Promise<"ok" | "address" | "day"> {
        const total = await prisma.waitlistSignup.aggregate({
            where: { reportEmailDay: day },
            _sum: { reportEmailCount: true },
        });
        if ((total._sum.reportEmailCount ?? 0) >= REPORT_EMAILS_PER_DAY) {
            return "day";
        }
        const sameDay = await prisma.waitlistSignup.updateMany({
            where: {
                id,
                reportEmailDay: day,
                reportEmailCount: { lt: EMAILS_PER_DAY },
            },
            data: { reportEmailCount: { increment: 1 } },
        });
        if (sameDay.count === 1) return "ok";
        const newDay = await prisma.waitlistSignup.updateMany({
            where: {
                id,
                OR: [
                    { reportEmailDay: null },
                    { reportEmailDay: { not: day } },
                ],
            },
            data: { reportEmailDay: day, reportEmailCount: 1 },
        });
        return newDay.count === 1 ? "ok" : "address";
    }

    /** The entry for this address, made or updated; its id. */
    private async store(row: {
        email: string;
        emailKey: string;
        checkedUrl: string;
        checkedAt: Date;
        ipHash?: string;
    }): Promise<string> {
        const where = {
            emailKey_businessKey: {
                emailKey: row.emailKey,
                businessKey: NO_BUSINESS,
            },
        };
        const update = { checkedUrl: row.checkedUrl, checkedAt: row.checkedAt };
        const existing = await prisma.waitlistSignup.findUnique({
            where,
            select: { id: true },
        });
        if (existing) {
            await prisma.waitlistSignup.update({ where, data: update });
            return existing.id;
        }
        try {
            const created = await prisma.waitlistSignup.create({
                data: {
                    email: row.email,
                    emailKey: row.emailKey,
                    businessKey: NO_BUSINESS,
                    source: LINK_PREVIEW_SOURCE,
                    checkedUrl: row.checkedUrl,
                    checkedAt: row.checkedAt,
                    newsConsent: false,
                    ipHash: row.ipHash ?? null,
                },
                select: { id: true },
            });
            this.logger.log(
                `link preview: new report email ${maskEmail(row.email)}`,
            );
            return created.id;
        } catch (error) {
            // Two unlocks at once: the other one made the entry.
            if (prismaErrorCode(error) !== "P2002") throw error;
            const updated = await prisma.waitlistSignup.update({
                where,
                data: update,
                select: { id: true },
            });
            return updated.id;
        }
    }
}
