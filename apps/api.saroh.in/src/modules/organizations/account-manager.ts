import { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { emailVerifiedBySelf } from "../../common/auth/email-verification";
import { AdminRole } from "../admin/admin-permissions";
import { MANAGER_CODE_PATTERN } from "../admin/staff-profile";
import { normaliseEmail } from "../waitlist/waitlist-keys";

/**
 * Who at Saroh brought a new business in (DEC-169, admin console U19).
 *
 * A business is **brought in** by an account manager when, in this order
 * (the first proof wins):
 *
 * 1. **LINK**: the sign-up carried the manager's `?am=` link, kept by
 *    saroh.in in the `saroh_am` cookie and sent by the workspace with the
 *    business;
 * 2. **CODE**: the owner typed the manager's code at setup;
 * 3. **LEAD_EMAIL**: the owner's own verified email was on a lead the
 *    manager owns, recorded **before the business was made**. An email
 *    staff marked verified doesn't count (`emailVerifiedBySelf`), and
 *    neither does an email put on the lead afterwards.
 *
 * Otherwise nobody is linked here, and staff assign one later (ASSIGNED,
 * U25). A business referral (DEC-156) is recorded beside this and pays
 * nobody.
 *
 * Only a teammate who holds the Account manager role now (an active grant
 * and an unrevoked, unexpired assignment) can be linked: an unknown code,
 * or a revoked or expired manager's, names nobody, silently, and the next
 * proof is tried. Nobody brings in their own business: a manager setting
 * one up for themselves is not linked to it.
 *
 * The link is written in the business's create transaction, under a
 * savepoint, by {@link recordManagerInTx}: anything that goes wrong is
 * rolled back to the savepoint and logged, and the business is made
 * without a manager. Attribution never stops a sign-up.
 */

/** How a link started. `AccountManagerLink_source_check` holds the same list. */
export const LINK_SOURCES = ["LINK", "CODE", "LEAD_EMAIL", "ASSIGNED"] as const;
export type LinkSource = (typeof LINK_SOURCES)[number];

/** What a link is. `AccountManagerLink_kind_check`. */
export const LINK_KINDS = ["BROUGHT_IN", "ASSIGNED"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** The kind a source makes: staff giving it is ASSIGNED, the rest BROUGHT_IN. */
export function kindOf(source: LinkSource): LinkKind {
    return source === "ASSIGNED" ? "ASSIGNED" : "BROUGHT_IN";
}

/**
 * A manager code as it is stored (capitals, no spaces or dashes), or null
 * for anything not shaped like one. Codes are read out and typed, so
 * "abcd-2345 " is the same code as "ABCD2345".
 */
export function managerCodeOf(raw: unknown): string | null {
    if (typeof raw !== "string" || raw.length > 64) return null;
    const code = raw.replace(/[\s-]+/g, "").toUpperCase();
    return MANAGER_CODE_PATTERN.test(code) ? code : null;
}

/**
 * When the `saroh_am` cookie was set, from what the workspace sent, or
 * null. A time in the future, or before Saroh's sign-up existed, is not
 * one: it was made up.
 */
export function linkSetAtOf(raw: unknown, now: Date): Date | null {
    if (typeof raw !== "string" || raw.length > 40) return null;
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) return null;
    if (at.getTime() > now.getTime() + 60_000) return null;
    if (at.getTime() < Date.UTC(2026, 0, 1)) return null;
    return at;
}

/** What setup carried about a manager: the link's cookie, a typed code. */
export interface ManagerClaim {
    /** The `?am=` code the browser kept, and when it was kept. */
    link?: { code: unknown; setAt?: unknown } | null;
    /** The code the owner typed at setup. */
    code?: unknown;
}

/** The proof a link started on, stored on it. Never a person's email. */
export type LinkEvidence =
    | { source: "LINK"; code: string; cookieSetAt: string | null }
    | { source: "CODE"; code: string }
    | {
          source: "LEAD_EMAIL";
          leadId: string;
          /** Which of the lead's emails it was. */
          leadField: "email" | "signUpEmail";
          emailRecordedAt: string;
      };

/** Who brought the business in, and how it is proved. */
export interface Attribution {
    platformAdminId: string;
    source: Exclude<LinkSource, "ASSIGNED">;
    evidence: LinkEvidence;
}

type Tx = Prisma.TransactionClient;

/**
 * The teammate whose code this is, if they hold the Account manager role
 * now and are not the business's own owner.
 */
async function managerByCode(
    tx: Tx,
    code: string,
    ownerUserId: string,
    now: Date,
): Promise<string | null> {
    const profile = await tx.staffProfile.findUnique({
        where: { managerCode: code },
        select: { platformAdminId: true },
    });
    if (!profile) return null;
    return (await isActiveManager(
        tx,
        profile.platformAdminId,
        ownerUserId,
        now,
    ))
        ? profile.platformAdminId
        : null;
}

/**
 * Does `platformAdminId` hold the Account manager role at `now`: an
 * unrevoked grant with an unrevoked assignment that hasn't expired? Their
 * own business never counts.
 */
export async function isActiveManager(
    tx: Tx,
    platformAdminId: string,
    ownerUserId: string,
    now: Date,
): Promise<boolean> {
    const grant = await tx.platformAdmin.findFirst({
        where: {
            id: platformAdminId,
            revokedAt: null,
            roleAssignments: {
                some: {
                    role: AdminRole.AccountManager,
                    revokedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
            },
        },
        select: { userId: true },
    });
    return grant !== null && grant.userId !== ownerUserId;
}

/**
 * The lead holding the owner's own verified email from before the business
 * was made, and the manager who owns it now. The email is the account's,
 * read here, never a value from the request.
 */
async function managerByLeadEmail(
    tx: Tx,
    ownerUserId: string,
    madeAt: Date,
    now: Date,
): Promise<Attribution | null> {
    const user = await tx.user.findUnique({
        where: { id: ownerUserId },
        select: {
            email: true,
            emailVerified: true,
            emailVerifiedByStaffAt: true,
        },
    });
    if (!user || !emailVerifiedBySelf(user)) return null;
    const key = normaliseEmail(user.email).key;
    // An email is on one lead at most, as its email or its sign-up email
    // (`assertEmailFree`); both are read, and the earlier recording wins.
    const leads = await tx.sarohLead.findMany({
        where: {
            ownerPlatformAdminId: { not: null },
            OR: [
                { emailKey: key, emailAt: { lt: madeAt } },
                { signUpEmailKey: key, signUpEmailAt: { lt: madeAt } },
            ],
        },
        select: {
            id: true,
            ownerPlatformAdminId: true,
            emailKey: true,
            emailAt: true,
            signUpEmailKey: true,
            signUpEmailAt: true,
        },
    });
    const proofs = leads
        .flatMap((lead) => {
            const out: {
                leadId: string;
                owner: string;
                field: "email" | "signUpEmail";
                at: Date;
            }[] = [];
            if (!lead.ownerPlatformAdminId) return out;
            if (
                lead.emailKey === key &&
                lead.emailAt &&
                lead.emailAt < madeAt
            ) {
                out.push({
                    leadId: lead.id,
                    owner: lead.ownerPlatformAdminId,
                    field: "email",
                    at: lead.emailAt,
                });
            }
            if (
                lead.signUpEmailKey === key &&
                lead.signUpEmailAt &&
                lead.signUpEmailAt < madeAt
            ) {
                out.push({
                    leadId: lead.id,
                    owner: lead.ownerPlatformAdminId,
                    field: "signUpEmail",
                    at: lead.signUpEmailAt,
                });
            }
            return out;
        })
        .sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const proof of proofs) {
        if (await isActiveManager(tx, proof.owner, ownerUserId, now)) {
            return {
                platformAdminId: proof.owner,
                source: "LEAD_EMAIL",
                evidence: {
                    source: "LEAD_EMAIL",
                    leadId: proof.leadId,
                    leadField: proof.field,
                    emailRecordedAt: proof.at.toISOString(),
                },
            };
        }
    }
    return null;
}

/**
 * The manager who brought in the business `ownerUserId` is making, or
 * null: the link, then a typed code, then the earliest lead email recorded
 * before `madeAt`. Reads only; {@link recordManagerInTx} writes.
 */
export async function managerFor(
    tx: Tx,
    input: {
        ownerUserId: string;
        /** When the business was made: a lead email must be older. */
        madeAt: Date;
        claim: ManagerClaim;
        now?: Date;
    },
): Promise<Attribution | null> {
    const now = input.now ?? new Date();
    const linkCode = managerCodeOf(input.claim.link?.code);
    if (linkCode) {
        const manager = await managerByCode(
            tx,
            linkCode,
            input.ownerUserId,
            now,
        );
        if (manager) {
            const setAt = linkSetAtOf(input.claim.link?.setAt, now);
            return {
                platformAdminId: manager,
                source: "LINK",
                evidence: {
                    source: "LINK",
                    code: linkCode,
                    cookieSetAt: setAt ? setAt.toISOString() : null,
                },
            };
        }
    }
    const typed = managerCodeOf(input.claim.code);
    if (typed) {
        const manager = await managerByCode(tx, typed, input.ownerUserId, now);
        if (manager) {
            return {
                platformAdminId: manager,
                source: "CODE",
                evidence: { source: "CODE", code: typed },
            };
        }
    }
    return managerByLeadEmail(tx, input.ownerUserId, input.madeAt, now);
}

const SAVEPOINT = "account_manager_link";
const logger = new Logger("AccountManagerLink");

/** What failed, without a message that could quote an email. */
function errorKind(error: unknown): string {
    if (error && typeof error === "object") {
        const { code, name } = error as { code?: unknown; name?: unknown };
        if (typeof code === "string") return `code ${code}`;
        if (typeof name === "string") return name;
    }
    return "unknown error";
}

/**
 * Link the business just made, inside its create transaction, to the
 * manager who brought it in, if one did. Never fails the create: under a
 * savepoint, anything that goes wrong is undone, logged as WARN
 * `account_manager_link_failed`, and the business goes on with no manager
 * (staff can assign one). Each such WARN is a business whose manager went
 * unrecorded, so any at all is worth a look.
 */
export async function recordManagerInTx(
    tx: Tx,
    input: {
        organizationId: string;
        ownerUserId: string;
        madeAt: Date;
        claim: ManagerClaim;
    },
): Promise<Attribution | null> {
    await tx.$executeRawUnsafe(`SAVEPOINT ${SAVEPOINT}`);
    try {
        const found = await managerFor(tx, input);
        if (found) {
            await tx.accountManagerLink.create({
                data: {
                    organizationId: input.organizationId,
                    platformAdminId: found.platformAdminId,
                    source: found.source,
                    kind: kindOf(found.source),
                    evidence: found.evidence,
                    startedAt: input.madeAt,
                },
            });
        }
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${SAVEPOINT}`);
        return found;
    } catch (error) {
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
        logger.warn(
            `account_manager_link_failed organization=${input.organizationId} reason=${errorKind(error)}`,
        );
        return null;
    }
}
