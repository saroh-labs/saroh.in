import { createHmac } from "node:crypto";

import { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { visitorHashSecret } from "../../modules/analytics/visitor-hash";
import { ChallengeVerifier } from "../../modules/site-accounts/challenge";

/**
 * The per-address cap on the codes and links Saroh's sign-in mails
 * (`@saroh/auth`'s `mayMailCode`): Better Auth's own limit counts the
 * caller only, so many callers could flood one mailbox.
 *
 * Counted from `AccountEmailCodeSend` rows, checked and written in one
 * transaction under a per-address advisory lock, as `claimStart` does for
 * phones (`account-phone/phone-limits.ts`), so a burst can't pass together
 * and the cap holds across API instances and restarts. Every ask counts,
 * whether or not the address has an account.
 *
 * Past the hourly cap a code is not refused (owner, 30 Oct: a refusal would
 * let anyone lock a person out of their codes): it needs the bot challenge
 * (Turnstile), as a site customer's does past its limit (ADR-011). With a
 * valid token it goes. With Turnstile not set up there is no challenge to
 * ask, so it goes and Saroh logs it, as phone sign-in's start does. The
 * 30-second cooldown holds either way.
 *
 * shortcut: rows are never swept (an index keeps the count cheap); add a sweep if the table grows large.
 */
const HOUR_MS = 60 * 60 * 1000;

/** Between two codes for one address: the screen's Resend opens at 30 s. */
export const CODE_MAIL_COOLDOWN_SECONDS = 30;
/** Codes for one address in an hour. */
export const CODE_MAILS_PER_ADDRESS_PER_HOUR = 5;

export function emailHash(email: string): string {
    return createHmac("sha256", visitorHashSecret())
        .update(`account-email:${email.trim().toLowerCase()}`)
        .digest("hex");
}

const challenge = new ChallengeVerifier();
const logger = new Logger("CodeMailLimits");
let unconfiguredWarnedAt = 0;

export type CodeMailVerdict =
    { retryAfterSeconds: number } | { challenge: true } | null;

/**
 * Null when a code may go to `email` now (and the ask is recorded); else the
 * wait, or `challenge` when it is past the cap and has no passing token.
 */
export async function claimCodeMail(
    email: string,
    turnstileToken: string | null = null,
    now = new Date(),
    verifier: Pick<ChallengeVerifier, "configured" | "verify"> = challenge,
): Promise<CodeMailVerdict> {
    const hash = emailHash(email);
    // Asked before the lock: a token is only sent after a `challenge` answer.
    const passed = turnstileToken
        ? await verifier.verify(turnstileToken, "")
        : false;
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account-email:${hash}`}))`;
        const recent = await tx.accountEmailCodeSend.findMany({
            where: {
                emailHash: hash,
                createdAt: { gt: new Date(now.getTime() - HOUR_MS) },
            },
            orderBy: { createdAt: "desc" },
            take: CODE_MAILS_PER_ADDRESS_PER_HOUR,
            select: { createdAt: true },
        });
        const wait = (freeAt: number) => ({
            retryAfterSeconds: Math.max(
                1,
                Math.ceil((freeAt - now.getTime()) / 1000),
            ),
        });
        if (recent.length > 0) {
            const cooldownEnds =
                recent[0].createdAt.getTime() +
                CODE_MAIL_COOLDOWN_SECONDS * 1000;
            if (cooldownEnds > now.getTime()) return wait(cooldownEnds);
        }
        if (recent.length >= CODE_MAILS_PER_ADDRESS_PER_HOUR) {
            if (verifier.configured) {
                if (!passed) return { challenge: true } as const;
            } else if (now.getTime() - unconfiguredWarnedAt > HOUR_MS) {
                unconfiguredWarnedAt = now.getTime();
                logger.error(
                    "account_email_challenge_not_configured: an address past its hourly code cap got a code with no bot check; set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY",
                );
            }
        }
        await tx.accountEmailCodeSend.create({
            data: { emailHash: hash, createdAt: now },
        });
        return null;
    });
}
