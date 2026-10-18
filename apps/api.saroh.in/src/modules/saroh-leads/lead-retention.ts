import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { WEBSITE_LEAD_KEEP_DAYS } from "./lead-rules";

type Tx = Pick<Prisma.TransactionClient, "sarohLead" | "waitlistSignup">;

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 500;

/** A lead the website brought in and that never became a business. */
const UNCONVERTED_WEBSITE_LEAD: Prisma.SarohLeadWhereInput = {
    source: { in: ["WEBSITE", "WAITLIST"] },
    stage: { not: "WON" },
};

/**
 * The enquiry purge's half for leads (DEC-169, R35): an unconverted lead
 * that came from the website follows its enquiry's 12-month deletion. It
 * goes once the website hasn't brought it in for 12 months (every enquiry
 * that made or touched it is then past keeping and deleted in the same run,
 * `contact-messages/contact-retention.ts`) and no waitlist entry with its
 * email is left, since a waitlist entry keeps to its own rule. Its calls and
 * visits go with it. A lead a manager added, or one that became a business,
 * is never deleted here. Returns how many went.
 */
export async function deleteStaleWebsiteLeads(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - WEBSITE_LEAD_KEEP_DAYS * DAY_MS);
    let total = 0;
    let after: string | undefined;
    for (;;) {
        const due = await prisma.sarohLead.findMany({
            where: {
                ...UNCONVERTED_WEBSITE_LEAD,
                websiteSeenAt: { lt: cutoff },
                ...(after ? { id: { gt: after } } : {}),
            },
            select: { id: true, emailKey: true, signUpEmailKey: true },
            orderBy: { id: "asc" },
            take: BATCH,
        });
        if (due.length === 0) return total;
        after = due[due.length - 1]?.id;

        const keys = due.flatMap((lead) =>
            [lead.emailKey, lead.signUpEmailKey].filter(
                (key): key is string => key !== null,
            ),
        );
        const waiting = new Set(
            (
                await prisma.waitlistSignup.findMany({
                    where: { emailKey: { in: keys } },
                    select: { emailKey: true },
                })
            ).map((row) => row.emailKey),
        );
        const ids = due
            .filter(
                (lead) =>
                    !(lead.emailKey && waiting.has(lead.emailKey)) &&
                    !(lead.signUpEmailKey && waiting.has(lead.signUpEmailKey)),
            )
            .map((lead) => lead.id);
        if (ids.length > 0) {
            const { count } = await prisma.sarohLead.deleteMany({
                where: {
                    id: { in: ids },
                    ...UNCONVERTED_WEBSITE_LEAD,
                    websiteSeenAt: { lt: cutoff },
                },
            });
            total += count;
        }
        if (due.length < BATCH) return total;
    }
}

/**
 * Someone asked to be taken off the waitlist ("at once if you ask"): their
 * unconverted website lead goes too, unless another waitlist entry with the
 * same email is still there. Run in the removal's transaction, after the
 * entry is deleted. True when a lead went.
 */
export async function deleteWebsiteLeadOnRequest(
    tx: Tx,
    emailKey: string,
): Promise<boolean> {
    const stillWaiting = await tx.waitlistSignup.count({ where: { emailKey } });
    if (stillWaiting > 0) return false;
    const { count } = await tx.sarohLead.deleteMany({
        where: {
            OR: [{ emailKey }, { signUpEmailKey: emailKey }],
            ...UNCONVERTED_WEBSITE_LEAD,
        },
    });
    return count > 0;
}
