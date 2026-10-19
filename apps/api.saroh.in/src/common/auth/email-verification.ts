import { prisma } from "@saroh/database";

/**
 * Whose word a verified email rests on (admin console U9).
 *
 * `User.emailVerified` is true either because the person proved the mailbox
 * with a code (sign-up, sign-in or verifying it), or because Saroh staff
 * pressed "Mark verified" in the console, which also stamps
 * `User.emailVerifiedByStaffAt`. The two are told apart by that stamp:
 *
 * - self-verified: `emailVerified && emailVerifiedByStaffAt === null`;
 * - staff-verified: `emailVerified && emailVerifiedByStaffAt !== null`.
 *
 * Staff-marked verification never counts as the person's own: an account
 * manager's attribution (DEC-169, "verified means verified by the user's own
 * code, not by staff") and a staff invite's acceptance (the invite's email
 * must match a self-verified address) read {@link emailVerifiedBySelf}, never
 * `emailVerified` alone.
 *
 * The stamp is cleared when the person next proves the mailbox with a code
 * (`auth.ts` `onMailboxProven` → {@link clearStaffVerification}), and when
 * staff change the address (the new one starts unverified).
 */
export function emailVerifiedBySelf(user: {
    emailVerified: boolean;
    emailVerifiedByStaffAt: Date | null;
}): boolean {
    return user.emailVerified && user.emailVerifiedByStaffAt === null;
}

/** How a person's address came to be verified, for the console. */
export type EmailVerifiedBy = "self" | "staff" | null;

export function emailVerifiedBy(user: {
    emailVerified: boolean;
    emailVerifiedByStaffAt: Date | null;
}): EmailVerifiedBy {
    if (!user.emailVerified) return null;
    return user.emailVerifiedByStaffAt === null ? "self" : "staff";
}

/**
 * The person proved their mailbox themselves: their verification is now
 * their own. A no-op for anyone not staff-marked.
 */
export async function clearStaffVerification(userId: string): Promise<void> {
    await prisma.user.updateMany({
        where: { id: userId, emailVerifiedByStaffAt: { not: null } },
        data: { emailVerifiedByStaffAt: null },
    });
}
