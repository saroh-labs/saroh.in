import type { AccountPhoneEventKind, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

/**
 * The server's limits on phone sign-in for Saroh accounts (DEC-196). A
 * WhatsApp code is sent by the server, so for it these are the hard stop on
 * sends. The SMS widget sends from the browser straight to the provider, so
 * for SMS they are the soft gate: they decide whether the browser is handed
 * the widget, and the hard stop is the widget's own captcha and limits in
 * the provider's dashboard (docs/architecture/, the messaging page). Failed
 * checks of either kind count toward the same failure caps.
 *
 * Counted from `AccountPhoneEvent` rows, as `messaging/abuse-guard.ts`
 * counts its rows, so a limit holds across API instances and restarts.
 * A start is checked and recorded in one step under per-key advisory locks
 * (`claimStart`), as abuse-guard does: pentest 28 Oct sent 20 at once and
 * 19 got through when the check and the record were apart.
 * shortcut: failed verifies are checked before and recorded after, so a burst can record more than the cap (each code still allows 5 tries, atomically); lock them too if that ever matters.
 */
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Between two starts (a WhatsApp send or the SMS widget) for one number. */
export const START_COOLDOWN_SECONDS = 30;
/** Starts for one number in a day. */
export const STARTS_PER_PHONE_PER_DAY = 10;
/** Starts from one address in an hour. */
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
            // A WhatsApp send that failed on our side doesn't hold the cooldown.
            where: { kind, phoneHash, reason: null },
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

type Db = Pick<Prisma.TransactionClient, "accountPhoneEvent">;

async function judge(
    rules: Rule[],
    now: Date,
    db: Db = prisma,
): Promise<LimitVerdict> {
    for (const rule of rules) {
        const since = new Date(now.getTime() - rule.windowSeconds * 1000);
        // The `max`th newest row in the window: if it exists the window is
        // full, and its ageing out is when one more fits.
        const full = await db.accountPhoneEvent.findFirst({
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

/**
 * May this number (and address) start now? If so, the START row is written
 * in the same locked transaction, so a burst can't pass together. Phone
 * before address, always, so two starts never wait on each other in a loop.
 */
export function claimStart(
    keys: LimitKeys,
    now = new Date(),
): Promise<
    | { allowed: true; eventId: string }
    | Extract<LimitVerdict, { allowed: false }>
> {
    return prisma.$transaction(async (tx) => {
        const locks = [
            `account-phone:${keys.phoneHash}`,
            ...(keys.ipHash ? [`account-phone-ip:${keys.ipHash}`] : []),
        ];
        for (const key of locks) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
        }
        const verdict = await judge(startRules(keys), now, tx);
        if (!verdict.allowed) return verdict;
        const row = await tx.accountPhoneEvent.create({
            data: {
                kind: "START",
                phoneHash: keys.phoneHash,
                ipHash: keys.ipHash ?? null,
            },
            select: { id: true },
        });
        return { allowed: true, eventId: row.id };
    });
}

/** May this number (and address) try another token now? */
export function checkFailures(
    keys: LimitKeys,
    now = new Date(),
): Promise<LimitVerdict> {
    return judge(failureRules(keys), now);
}
