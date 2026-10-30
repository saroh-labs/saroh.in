import { createHmac } from "node:crypto";

import { prisma } from "@saroh/database";

import { visitorHashSecret } from "../../modules/analytics/visitor-hash";

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

/** Null when a code may go to `email` now (and the ask is recorded); else the wait. */
export function claimCodeMail(
    email: string,
    now = new Date(),
): Promise<{ retryAfterSeconds: number } | null> {
    const hash = emailHash(email);
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
            const oldest = recent[recent.length - 1];
            return wait(oldest.createdAt.getTime() + HOUR_MS);
        }
        await tx.accountEmailCodeSend.create({
            data: { emailHash: hash, createdAt: now },
        });
        return null;
    });
}
