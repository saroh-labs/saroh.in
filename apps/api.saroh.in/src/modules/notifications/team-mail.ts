import type { Prisma } from "@saroh/database";

import { appBase } from "../../common/app-url";
import { sendTeamNoticeEmail } from "../../common/email";
import { alertOn } from "./alert-preferences";
import type { TeamMail, WordedAlert } from "./team-alerts";

/**
 * Who Saroh's own mail tells about an alert, and what it says (UX-042,
 * UX-043). Saroh writing to the people on a business's team is Saroh
 * talking to its own users, as an enquiry's or a customer message's notice
 * does, so it needs no email provider of the business's: a new website
 * order reaches the owner on Free, and a reviewer hears they were asked.
 * Messages to the business's customers never go this way (DEC-011,
 * DEC-086's one route).
 *
 * The mails are written once the alert's claim commits (`TeamAlertHandler`),
 * so a run repeated after a rollback or a duplicate claim sends nothing
 * twice.
 */

type Tx = Prisma.TransactionClient;

/** The people to tell, as their email addresses. */
export async function sarohMailRecipients(
    tx: Pick<Tx, "membership" | "notificationPreference" | "siteReviewer">,
    organizationId: string,
    alert: Pick<
        WordedAlert,
        "event" | "sarohMail" | "siteId" | "skipUserId" | "alwaysUserId"
    >,
): Promise<string[]> {
    if (alert.sarohMail === "REVIEWERS") {
        if (!alert.siteId) return [];
        const grants = await tx.siteReviewer.findMany({
            where: { organizationId, siteId: alert.siteId },
            select: { userId: true, user: { select: { email: true } } },
            orderBy: { userId: "asc" },
        });
        // Still on the team: a grant outlives nothing, but read it anyway.
        const members = new Set(
            (
                await tx.membership.findMany({
                    where: {
                        organizationId,
                        userId: { in: grants.map((g) => g.userId) },
                    },
                    select: { userId: true },
                })
            ).map((m) => m.userId),
        );
        return unique(
            grants
                .filter(
                    (g) =>
                        g.userId !== alert.skipUserId && members.has(g.userId),
                )
                .map((g) => g.user.email),
        );
    }
    if (alert.sarohMail !== "OWNERS_ADMINS") return [];
    const [members, choices] = await Promise.all([
        tx.membership.findMany({
            where: { organizationId, role: { in: ["OWNER", "ADMIN"] } },
            select: { userId: true, user: { select: { email: true } } },
            orderBy: { userId: "asc" },
        }),
        tx.notificationPreference.findMany({
            where: { organizationId, event: alert.event, channel: "email" },
            select: {
                userId: true,
                event: true,
                channel: true,
                enabled: true,
            },
        }),
    ]);
    return unique(
        members
            .filter((m) => {
                if (m.userId === alert.skipUserId) return false;
                if (m.userId === alert.alwaysUserId) return true;
                const own = choices.filter((c) => c.userId === m.userId);
                // On unless they turned it off: an owner hears of a sale
                // as of an enquiry, whatever the row's default.
                return own.length === 0 || alertOn(own, alert.event, "email");
            })
            .map((m) => m.user.email),
    );
}

/** The mails for an alert, one per person. */
export function teamMails(
    alert: Pick<WordedAlert, "title" | "body" | "path" | "cta">,
    business: string,
    to: readonly string[],
): TeamMail[] {
    const url = `${appBase()}${alert.path ?? "/"}`;
    return to.map((address) => ({
        to: address,
        subject: `${business}: ${alert.title}`,
        heading: alert.title,
        text: alert.body,
        url,
        cta: alert.cta ?? "Open it in Saroh",
    }));
}

/** Send them; each send never throws (console fallback with no SMTP). */
export async function sendTeamMails(mails: readonly TeamMail[]): Promise<void> {
    for (const mail of mails) {
        await sendTeamNoticeEmail(mail.to, mail);
    }
}

function unique(emails: readonly (string | null | undefined)[]): string[] {
    return Array.from(
        new Set(emails.filter((e): e is string => Boolean(e?.trim()))),
    );
}
