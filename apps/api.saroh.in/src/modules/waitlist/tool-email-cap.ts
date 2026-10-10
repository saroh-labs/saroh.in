import { prisma } from "@saroh/database";

/**
 * The caps on the emails saroh.in's free tools send (the link preview
 * report, the QR code maker's link back), counted in the waitlist's store
 * so a restart or a second API process doesn't reset them. One budget for
 * every tool: anyone on the internet can make a tool send an email to an
 * address they type, so what bounds that is how many Saroh sends in all,
 * not how many each tool does (`docs/patterns/backend-integrations.md`,
 * "An email a stranger can trigger carries only our words").
 */

/** Tool emails to one address in one UTC day. */
export const EMAILS_PER_DAY = 3;
/** Every tool email Saroh sends in one UTC day, to anyone. */
export const REPORT_EMAILS_PER_DAY = 300;

/** The UTC day `now` falls on, as a DATE column holds it. */
export function utcDay(now: Date): Date {
    return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
}

/**
 * Take one of today's emails for this entry: `ok`, or which cap is spent.
 * The day's total is a sum, so two unlocks at the very edge may both pass
 * it; the per-address count is a conditional update, so it never goes past
 * {@link EMAILS_PER_DAY}.
 */
export async function claimToolEmail(
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
            OR: [{ reportEmailDay: null }, { reportEmailDay: { not: day } }],
        },
        data: { reportEmailDay: day, reportEmailCount: 1 },
    });
    return newDay.count === 1 ? "ok" : "address";
}
