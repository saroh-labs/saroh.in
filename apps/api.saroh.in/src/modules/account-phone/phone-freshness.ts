import { prisma } from "@saroh/database";

/** How long a phone signs in without a fresh code, phone sign-in or email sign-in. */
export const PHONE_FRESH_MONTHS = 12;

/**
 * Whether a phone still signs in (DEC-198): verified (or renewed by an
 * email sign-in, `renewPhoneOnEmailSignIn`) or used to sign in within
 * {@link PHONE_FRESH_MONTHS}. A recycled number's next holder meets an
 * old, unused phone and is sent to the email.
 */
export async function phoneFresh(
    userId: string,
    verifiedAt: Date | null,
): Promise<boolean> {
    const since = new Date();
    since.setMonth(since.getMonth() - PHONE_FRESH_MONTHS);
    if (verifiedAt && verifiedAt > since) return true;
    const used = await prisma.accountPhoneEvent.findFirst({
        where: { userId, kind: "SIGNED_IN", createdAt: { gt: since } },
        select: { id: true },
    });
    return used !== null;
}

/**
 * An email-code sign-in vouches for the account's phone again (DEC-198):
 * its 12 months start over. Called from Better Auth's `onMailboxProven`.
 */
export async function renewPhoneOnEmailSignIn(userId: string): Promise<void> {
    await prisma.user.updateMany({
        where: { id: userId, phoneVerifiedAt: { not: null } },
        data: { phoneVerifiedAt: new Date() },
    });
}
