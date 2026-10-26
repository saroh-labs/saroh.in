import type { Prisma } from "@saroh/database";

/**
 * Abuse controls on Saroh-sent codes (DEC-191, #1239): before a send, count
 * the `PhoneVerification` rows already written in rolling windows, as
 * `billing/metering.ts` counts what's there instead of keeping a counter.
 * The per-number windows look across every business: SMS pumping targets
 * numbers, not tenants. The caller runs this in the transaction that then
 * writes the row, with no organization GUC set (so the count sees every
 * business) and sets the GUC only for that insert.
 */
export const RESEND_COOLDOWN_SECONDS = 30;
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type AbuseReason = "number" | "business" | "address";
export type AbuseVerdict =
    | { allowed: true }
    | { allowed: false; reason: AbuseReason; retryAfterSeconds: number };

export interface AbuseInput {
    organizationId: string;
    phoneE164: string;
    ipHash?: string | null;
}

interface Rule {
    reason: AbuseReason;
    max: number;
    windowSeconds: number;
    where: Prisma.PhoneVerificationWhereInput;
}

function rules(input: AbuseInput): Rule[] {
    const { organizationId, phoneE164, ipHash } = input;
    const list: Rule[] = [
        // Resend cooldown: one start per number per business every 30 s.
        {
            reason: "number",
            max: 1,
            windowSeconds: RESEND_COOLDOWN_SECONDS,
            where: { phoneE164, organizationId },
        },
        {
            reason: "number",
            max: 3,
            windowSeconds: 10 * MINUTE,
            where: { phoneE164 },
        },
        { reason: "number", max: 10, windowSeconds: DAY, where: { phoneE164 } },
        {
            reason: "business",
            max: 500,
            windowSeconds: DAY,
            where: { organizationId },
        },
    ];
    if (ipHash) {
        list.push({
            reason: "address",
            max: 10,
            windowSeconds: HOUR,
            where: { ipHash },
        });
    }
    return list;
}

/**
 * Lock the number, the business and the address (in that fixed order, so
 * two starts can't deadlock), then judge. The locks are held to the end of
 * `tx`, so two starts at a limit can't both count under it and both insert.
 */
export async function checkAbuse(
    tx: Prisma.TransactionClient,
    input: AbuseInput,
    now = new Date(),
): Promise<AbuseVerdict> {
    const keys = [
        `otp-number:${input.phoneE164}`,
        `otp-business:${input.organizationId}`,
        ...(input.ipHash ? [`otp-address:${input.ipHash}`] : []),
    ];
    for (const key of keys) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    }
    for (const rule of rules(input)) {
        const since = new Date(now.getTime() - rule.windowSeconds * 1000);
        // The `max`th newest row in the window: if it exists the window is
        // full, and it ageing out is when a start fits again.
        const full = await tx.phoneVerification.findFirst({
            where: { ...rule.where, createdAt: { gt: since } },
            orderBy: { createdAt: "desc" },
            skip: rule.max - 1,
            select: { createdAt: true },
        });
        if (full) {
            const freeAt = full.createdAt.getTime() + rule.windowSeconds * 1000;
            return {
                allowed: false,
                reason: rule.reason,
                retryAfterSeconds: Math.max(
                    1,
                    Math.ceil((freeAt - now.getTime()) / 1000),
                ),
            };
        }
    }
    return { allowed: true };
}
