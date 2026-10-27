import type { AccountPhoneEventKind, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

/**
 * The server's limits on phone sign-in for Saroh accounts (DEC-196). The
 * OTP widget sends its code from the browser straight to the provider, so
 * these are the soft gate: they decide whether the browser is handed the
 * widget, and how many tokens a phone or an address may try. The hard stop
 * on sends is the widget's own captcha and limits in the provider's
 * dashboard (docs/architecture/, the messaging page).
 *
 * Counted from `AccountPhoneEvent` rows, as `messaging/abuse-guard.ts`
 * counts its rows, so a limit holds across API instances and restarts.
 * shortcut: two requests at a limit in the same instant can both pass (no advisory lock, unlike abuse-guard); lock per key if a burst ever gets through.
 */
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Between two widget starts for one number. */
export const START_COOLDOWN_SECONDS = 30;
/** Widget starts for one number in a day. */
export const STARTS_PER_PHONE_PER_DAY = 10;
/** Widget starts from one address in an hour. */
export const STARTS_PER_ADDRESS_PER_HOUR = 20;
/** Failed verifies for one number in a day. */
export const FAILS_PER_PHONE_PER_DAY = 10;
/** Failed verifies from one address in a day. */
export const FAILS_PER_ADDRESS_PER_DAY = 20;

export type LimitReason =
    | "phone_cooldown"
    | "phone_daily"
    | "address_hourly"
    | "phone_failures"
    | "address_failures";

export type LimitVerdict =
    | { allowed: true }
    | { allowed: false; reason: LimitReason; retryAfterSeconds: number };

interface Rule {
    reason: LimitReason;
    max: number;
    windowSeconds: number;
    where: Prisma.AccountPhoneEventWhereInput;
}

export interface LimitKeys {
    phoneHash: string;
    ipHash?: string;
}

function startRules({ phoneHash, ipHash }: LimitKeys): Rule[] {
    const kind: AccountPhoneEventKind = "START";
    return [
        {
            reason: "phone_cooldown",
            max: 1,
            windowSeconds: START_COOLDOWN_SECONDS,
            where: { kind, phoneHash },
        },
        {
            reason: "phone_daily",
            max: STARTS_PER_PHONE_PER_DAY,
            windowSeconds: DAY,
            where: { kind, phoneHash },
        },
        ...(ipHash
            ? [
                  {
                      reason: "address_hourly" as const,
                      max: STARTS_PER_ADDRESS_PER_HOUR,
                      windowSeconds: HOUR,
                      where: { kind, ipHash },
                  },
              ]
            : []),
    ];
}

function failureRules({ phoneHash, ipHash }: LimitKeys): Rule[] {
    const kind: AccountPhoneEventKind = "VERIFY_FAILED";
    return [
        {
            reason: "phone_failures",
            max: FAILS_PER_PHONE_PER_DAY,
            windowSeconds: DAY,
            where: { kind, phoneHash },
        },
        ...(ipHash
            ? [
                  {
                      reason: "address_failures" as const,
                      max: FAILS_PER_ADDRESS_PER_DAY,
                      windowSeconds: DAY,
                      where: { kind, ipHash },
                  },
              ]
            : []),
    ];
}

async function judge(rules: Rule[], now: Date): Promise<LimitVerdict> {
    for (const rule of rules) {
        const since = new Date(now.getTime() - rule.windowSeconds * 1000);
        // The `max`th newest row in the window: if it exists the window is
        // full, and its ageing out is when one more fits.
        const full = await prisma.accountPhoneEvent.findFirst({
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

/** May this number (and address) open the widget now? */
export function checkStart(
    keys: LimitKeys,
    now = new Date(),
): Promise<LimitVerdict> {
    return judge(startRules(keys), now);
}

/** May this number (and address) try another token now? */
export function checkFailures(
    keys: LimitKeys,
    now = new Date(),
): Promise<LimitVerdict> {
    return judge(failureRules(keys), now);
}
