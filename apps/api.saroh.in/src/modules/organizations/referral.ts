import { outsideOrgContext, prisma } from "@saroh/database";

import { normaliseEmail, REF_CODE_PATTERN } from "../waitlist/waitlist-keys";
import { OrganizationLifecycleStatus } from "./organization-lifecycle.policy";

/**
 * Who referred a new business (DEC-156): the business whose referral code
 * (`Organization.referralCode`, DEC-102) its owner arrived with. Recorded
 * once, as the business is made, and read by operators only. Nothing here
 * rewards anyone; it keeps the fact.
 *
 * The rules, all decided here on the server from what the database holds:
 *
 * - **A code that names no business refers nobody**, silently: malformed,
 *   unknown, or the code of a business that has been deleted.
 * - **A waitlist entry's id is not a business's code.** Both travel as
 *   `?ref=` and are drawn from the same alphabet, so they are told apart by
 *   table, never by shape: only `Organization.referralCode` is read here,
 *   and a code that is also a waitlist entry's id refers nobody.
 * - **Nobody refers themselves.** Someone who is already in the referring
 *   business, in any role, is making another business of their own. (A new
 *   business can't be the one that referred it; the column's CHECK holds
 *   that too.)
 * - **One level.** Only the business whose code was carried is recorded,
 *   never whoever referred that business.
 * - **The code the browser carried comes first.** With none that names a
 *   business, the referring business kept on the owner's waitlist entry is
 *   used, and only when the account's email is confirmed.
 *
 * Every read is across businesses by nature, so it is made outside any
 * organization context (`backend-data-and-money.md`).
 */

/** A referral code as it is stored, or null for anything not shaped like one. */
export function referralCodeOf(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const code = raw.trim().toLowerCase();
    return REF_CODE_PATTERN.test(code) ? code : null;
}

const NOT_DELETED = {
    lifecycleStatus: { not: OrganizationLifecycleStatus.DeletedRetained },
} as const;

/**
 * The business a referral code is, by id, or null: malformed, unknown, or a
 * deleted business's. Never told to the caller that sent the code.
 */
export async function businessByReferralCode(
    raw: unknown,
): Promise<string | null> {
    const code = referralCodeOf(raw);
    if (!code) return null;
    const business = await outsideOrgContext(() =>
        prisma.organization.findFirst({
            where: { referralCode: code, ...NOT_DELETED },
            select: { id: true },
        }),
    );
    return business?.id ?? null;
}

/** The business the code names, unless a waitlist entry's id is the same. */
async function fromCode(raw: unknown): Promise<string | null> {
    const code = referralCodeOf(raw);
    if (!code) return null;
    const entry = await outsideOrgContext(() =>
        prisma.waitlistSignup.findUnique({
            where: { refCode: code },
            select: { id: true },
        }),
    );
    return entry ? null : businessByReferralCode(code);
}

/**
 * The referring business the person's own waitlist entry kept, if it is
 * still a business: the earliest entry that has one, for an account whose
 * email is confirmed (an entry is found by its email, so an unconfirmed one
 * could be somebody else's).
 */
async function fromWaitlist(userId: string): Promise<string | null> {
    const user = await outsideOrgContext(() =>
        prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, emailVerified: true },
        }),
    );
    if (!user?.emailVerified) return null;
    const entry = await outsideOrgContext(() =>
        prisma.waitlistSignup.findFirst({
            where: {
                emailKey: normaliseEmail(user.email).key,
                referredByOrganizationId: { not: null },
            },
            orderBy: { createdAt: "asc" },
            select: { referredByOrganizationId: true },
        }),
    );
    const id = entry?.referredByOrganizationId;
    if (!id) return null;
    const business = await outsideOrgContext(() =>
        prisma.organization.findFirst({
            where: { id, ...NOT_DELETED },
            select: { id: true },
        }),
    );
    return business?.id ?? null;
}

/**
 * The business to record as having referred the one `userId` is about to
 * make, or null for none. `code` is whatever the browser carried, untrusted.
 */
export async function referringBusiness(input: {
    code: unknown;
    userId: string;
}): Promise<string | null> {
    const organizationId =
        (await fromCode(input.code)) ?? (await fromWaitlist(input.userId));
    if (!organizationId) return null;
    const member = await outsideOrgContext(() =>
        prisma.membership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId: input.userId,
                },
            },
            select: { id: true },
        }),
    );
    return member ? null : organizationId;
}
