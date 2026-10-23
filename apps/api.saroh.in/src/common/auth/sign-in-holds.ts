import { prisma } from "@saroh/database";

/**
 * The takeover safeguard on a sign-in email Saroh staff changed (admin
 * console U9): for 24 hours after the change, unless a second staff member
 * confirms it, the new address gets no sign-in code and the person starts no
 * session, by any way in. The old address has been told, so its owner has a
 * day to say it wasn't them.
 *
 * A change holds while it is the person's latest, its new address is still
 * theirs, nobody confirmed it and `codeHeldUntil` is ahead. Better Auth asks
 * through the two hooks `auth.ts` gives it (`sendVerificationOTP`,
 * `mayStartSession`); the console's own sends ask too.
 */

interface HoldRow {
    id: string;
    newEmail: string;
    codeHeldUntil: Date;
    confirmedAt: Date | null;
    requestedByUserId: string;
}

const holdSelect = {
    id: true,
    newEmail: true,
    codeHeldUntil: true,
    confirmedAt: true,
    requestedByUserId: true,
} as const;

/** Whether a change still holds, given the person's address now. */
export function holds(
    change: HoldRow | null,
    currentEmail: string,
    now: Date = new Date(),
): boolean {
    return (
        change !== null &&
        change.confirmedAt === null &&
        change.newEmail === currentEmail &&
        change.codeHeldUntil.getTime() > now.getTime()
    );
}

/** A person's open hold, if they have one. */
export async function openHoldFor(
    userId: string,
    now: Date = new Date(),
): Promise<HoldRow | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            email: true,
            signInEmailChanges: {
                select: holdSelect,
                orderBy: { createdAt: "desc" },
                take: 1,
            },
        },
    });
    if (!user) return null;
    const latest = user.signInEmailChanges[0] ?? null;
    return holds(latest, user.email, now) ? latest : null;
}

/** Whether the account at this address is held. Unknown addresses are not. */
export async function signInHeldForEmail(
    email: string,
    now: Date = new Date(),
): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true },
    });
    if (!user) return false;
    return (await openHoldFor(user.id, now)) !== null;
}

/** Better Auth's `mayStartSession`: no session while the person is held. */
export async function mayStartSession(userId: string): Promise<boolean> {
    return (await openHoldFor(userId)) === null;
}
