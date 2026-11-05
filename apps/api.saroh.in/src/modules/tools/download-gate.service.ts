import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendLinkReportEmail } from "../../common/email";
import { indianPhoneE164 } from "../messaging/verification.service";
import {
    downloadEmailCap,
    REPORT_EMAILS_PER_DAY,
    utcDay,
} from "../waitlist/tool-email-cap";
import { maskEmail, normaliseEmail } from "../waitlist/waitlist-keys";
import {
    DOWNLOAD_CONSENT_VERSION,
    DOWNLOAD_NAMES,
    DOWNLOADS_URL,
} from "./download-names";

/**
 * The free downloads' gate (plan 2026-10-31-002 U9): an email or a WhatsApp
 * number for a download's file, kept as a `DownloadLead`, one per contact
 * and download; a repeat touches its last-requested time.
 *
 * Used only to send the file. No marketing consent is taken (an unverified
 * contact can't give it), and a number is never messaged: a phone lead
 * gets the file in the page and nothing else. An email lead also gets one
 * email, in our words, with the link back to the download, under the
 * tools' caps (`waitlist/tool-email-cap.ts`), read before the lead is
 * written. Past a cap the page still gives the file and says no email went.
 */

export interface DownloadUnlock {
    unlocked: true;
    /**
     * `sent`, `limited` (this address had its emails today), `not-sent`
     * (mail is down, or the day's emails are spent), `none` (a phone lead:
     * nothing is ever sent to a number).
     */
    emailed: "sent" | "limited" | "not-sent" | "none";
}

/** Who asked: an email or an Indian mobile, and the key that says "the same person". */
export interface DownloadContact {
    email: string | null;
    phone: string | null;
    key: string;
}

/** The contact from the request, or 400 naming the field (`email`, `phone`, `contact`). */
export function downloadContact(input: {
    email?: string;
    phone?: string;
}): DownloadContact {
    const email = input.email?.trim();
    const phone = input.phone?.trim();
    if (!email === !phone) {
        throw new BadRequestException({
            message: "Give an email or a WhatsApp number, one of the two.",
            details: { field: "contact" },
        });
    }
    if (phone) {
        const e164 = indianPhoneE164(phone);
        return { email: null, phone: e164, key: e164 };
    }
    const n = normaliseEmail(email ?? "");
    return { email: n.email, phone: null, key: n.key };
}

/** The one email a download sends: fixed words, the name and link from our list. */
export function downloadEmail(slug: string): { subject: string; text: string } {
    const name = DOWNLOAD_NAMES[slug];
    if (!name) throw new Error(`no free download "${slug}"`);
    return {
        subject: `${name}: your download`,
        text: [
            "Here's the link to the free download you asked for on saroh.in:",
            "",
            name,
            `${DOWNLOADS_URL}/${slug}`,
            "",
            "You asked for this on saroh.in. We won't send you anything else unless you ask.",
            "",
            "Saroh",
        ].join("\n"),
    };
}

@Injectable()
export class DownloadGateService {
    private readonly logger = new Logger(DownloadGateService.name);

    async unlock(input: {
        /** Already one of `DOWNLOAD_NAMES`. */
        slug: string;
        contact: DownloadContact;
        ipHash?: string;
        now?: Date;
    }): Promise<DownloadUnlock> {
        const { slug, contact } = input;
        const now = input.now ?? new Date();
        const day = utcDay(now);
        const cap = contact.email
            ? await downloadEmailCap(contact.key, day)
            : null;

        const lead = await prisma.downloadLead.upsert({
            where: { contactKey_slug: { contactKey: contact.key, slug } },
            create: {
                email: contact.email,
                phone: contact.phone,
                contactKey: contact.key,
                slug,
                source: `download:${slug}`,
                purpose: "download",
                consentVersion: DOWNLOAD_CONSENT_VERSION,
                ipHash: input.ipHash ?? null,
                createdAt: now,
                lastRequestedAt: now,
            },
            update: {
                lastRequestedAt: now,
                consentVersion: DOWNLOAD_CONSENT_VERSION,
            },
            select: { id: true },
        });

        if (!contact.email || !cap) return { unlocked: true, emailed: "none" };
        const masked = maskEmail(contact.email);
        if (cap === "address") return { unlocked: true, emailed: "limited" };
        if (cap === "day") {
            this.logger.warn(
                `download: the day's ${REPORT_EMAILS_PER_DAY} tool emails are spent; none to ${masked}`,
            );
            return { unlocked: true, emailed: "not-sent" };
        }
        const mail = downloadEmail(slug);
        await this.countEmail(lead.id, day);
        const outcome = await sendLinkReportEmail(
            contact.email,
            mail.subject,
            mail.text,
        );
        if (outcome !== "sent") {
            this.logger.warn(
                `download: email to ${masked} not sent (${outcome})`,
            );
        }
        return {
            unlocked: true,
            emailed: outcome === "sent" ? "sent" : "not-sent",
        };
    }

    /** Count today's email on the lead: one more today, or the first of a new day. */
    private async countEmail(id: string, day: Date): Promise<void> {
        const same = await prisma.downloadLead.updateMany({
            where: { id, emailDay: day },
            data: { emailCount: { increment: 1 } },
        });
        if (same.count === 0) {
            await prisma.downloadLead.update({
                where: { id },
                data: { emailDay: day, emailCount: 1 },
            });
        }
    }
}
