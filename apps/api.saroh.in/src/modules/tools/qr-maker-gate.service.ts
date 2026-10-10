import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendLinkReportEmail } from "../../common/email";
import { prismaErrorCode } from "../../common/prisma-errors";
import {
    claimToolEmail,
    REPORT_EMAILS_PER_DAY,
    utcDay,
} from "../waitlist/tool-email-cap";
import {
    maskEmail,
    normaliseEmail,
    QR_MAKER_SOURCE,
} from "../waitlist/waitlist-keys";
import { QR_MAKER_SUBJECT, qrMakerEmailText } from "./qr-maker-email";

/**
 * The QR code maker's email gate (QR codes plan U9), in the shape of the
 * link preview tool's (`link-preview/link-report-gate.service.ts`).
 *
 * An email unlocks the downloads in the page. It is kept in the waitlist's
 * store: a new entry with source `qr-maker` and when the tool was last
 * used (`checkedAt`; there is no link to keep, the API never sees it). An
 * address the store already holds from somewhere else is left exactly as
 * it was. The retention sweep drops a `qr-maker` entry 12 months after its
 * last use (`waitlist-retention.handler.ts`).
 *
 * No marketing consent is taken: anyone can type anyone's address, so an
 * unverified address can't say yes to news. `newsConsent` is false on the
 * entries this makes and never set.
 *
 * One email goes, in our own words, with a link back to the tool
 * (`qr-maker-email.ts`). It shares the tools' caps, counted in the database
 * (`waitlist/tool-email-cap.ts`): 3 a UTC day to one address, 300 a day in
 * all. Past either the page still unlocks, and says no email went.
 */

/** The waitlist's own key for an entry with no business named. */
const NO_BUSINESS = "";

export interface QrMakerUnlock {
    unlocked: true;
    /**
     * `sent`: the email left. `limited`: this address had its emails
     * today. `not-sent`: none went — mail is down, or the tools have sent
     * all they send today.
     */
    emailed: "sent" | "limited" | "not-sent";
}

@Injectable()
export class QrMakerGateService {
    private readonly logger = new Logger(QrMakerGateService.name);

    async unlock(input: {
        email: string;
        ipHash?: string;
        now?: Date;
    }): Promise<QrMakerUnlock> {
        const now = input.now ?? new Date();
        const { email, key } = normaliseEmail(input.email);
        const id = await this.store({
            email,
            emailKey: key,
            usedAt: now,
            ipHash: input.ipHash,
        });

        const claim = await claimToolEmail(id, utcDay(now));
        if (claim === "address") return { unlocked: true, emailed: "limited" };
        if (claim === "day") {
            this.logger.warn(
                `qr maker: the day's ${REPORT_EMAILS_PER_DAY} tool emails are spent; none to ${maskEmail(email)}`,
            );
            return { unlocked: true, emailed: "not-sent" };
        }
        // The tools' plain-text sender: a fixed subject and fixed words.
        const outcome = await sendLinkReportEmail(
            email,
            QR_MAKER_SUBJECT,
            qrMakerEmailText(),
        );
        if (outcome !== "sent") {
            this.logger.warn(
                `qr maker: email to ${maskEmail(email)} not sent (${outcome})`,
            );
        }
        return {
            unlocked: true,
            emailed: outcome === "sent" ? "sent" : "not-sent",
        };
    }

    /** The entry for this address, made or (if the tool's own) touched; its id. */
    private async store(row: {
        email: string;
        emailKey: string;
        usedAt: Date;
        ipHash?: string;
    }): Promise<string> {
        const where = {
            emailKey_businessKey: {
                emailKey: row.emailKey,
                businessKey: NO_BUSINESS,
            },
        };
        const touch = async (): Promise<string | null> => {
            const existing = await prisma.waitlistSignup.findUnique({
                where,
                select: { id: true, source: true },
            });
            if (!existing) return null;
            // Only the tool's own entry counts its 12 months from this
            // use; a waitlist or link-report entry keeps its own clock.
            if (existing.source === QR_MAKER_SOURCE) {
                await prisma.waitlistSignup.update({
                    where,
                    data: { checkedAt: row.usedAt },
                });
            }
            return existing.id;
        };

        const held = await touch();
        if (held) return held;
        try {
            const created = await prisma.waitlistSignup.create({
                data: {
                    email: row.email,
                    emailKey: row.emailKey,
                    businessKey: NO_BUSINESS,
                    source: QR_MAKER_SOURCE,
                    checkedAt: row.usedAt,
                    newsConsent: false,
                    ipHash: row.ipHash ?? null,
                },
                select: { id: true },
            });
            this.logger.log(`qr maker: new email ${maskEmail(row.email)}`);
            return created.id;
        } catch (error) {
            // Two unlocks at once: the other one made the entry.
            if (prismaErrorCode(error) !== "P2002") throw error;
            const other = await touch();
            if (!other) throw error;
            return other;
        }
    }
}
