import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { SignInCodeSender } from "../../common/auth/sign-in-code-sender";
import { openHoldFor } from "../../common/auth/sign-in-holds";
import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { sendSignInEmailChangedNotice } from "../../common/email";
import { prismaErrorCode } from "../../common/prisma-errors";
import { maskEmail } from "../waitlist/waitlist-keys";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission, AdminRole } from "./admin-permissions";
import {
    CODE_WINDOW_MS,
    CODES_PER_PERSON,
    CODES_PER_STAFF,
    EMAIL_CHANGE_HOLD_MS,
    SignInHelpAction,
} from "./sign-in-help-rules";

/** The job that sends the held code once the hold ends. */
export const SIGN_IN_EMAIL_RELEASE_TYPE = "people.sign-in-email.release";

/** Subscription states a business is paying (or about to pay) in. */
const PAID_STATES = ["ACTIVE", "TRIALING", "PAST_DUE"];

/**
 * Sign-in help from the console (admin console U9, R13): send a sign-in
 * code, mark an address verified, change a sign-in email and confirm that
 * change as a second staff member. Every write needs `people:sign-in-help`
 * and `organization:pii:read` (the routes), carries a reason and is on the
 * admin ledger in the same transaction as the change.
 *
 * Changing a sign-in email is how an account is taken over, so it carries
 * the safeguards (plan, "Sign-in help"):
 *
 * - the old address is told, with the new one masked;
 * - an owner of a business on a paid plan is changed only by a Platform
 *   owner;
 * - the new address starts unverified, and every session ends;
 * - the new address gets no code, and the person no session, for 24 hours
 *   unless a second, different staff member confirms
 *   (`common/auth/sign-in-holds.ts`);
 * - an address another account uses is refused.
 */
@Injectable()
export class AdminSignInHelpService {
    private readonly logger = new Logger(AdminSignInHelpService.name);

    constructor(
        private readonly audit: AdminAuditService,
        private readonly codes: SignInCodeSender,
    ) {}

    /**
     * Send a sign-in code to the person's address, through Better Auth.
     * At most {@link CODES_PER_PERSON} to one person and
     * {@link CODES_PER_STAFF} by one staff member an hour; a refusal says
     * when to try again and is on the ledger as DENIED.
     */
    async sendCode(staff: PlatformAdminInfo, userId: string, reason: string) {
        const why = requireReason(reason);
        const user = await findPerson(userId);
        const hold = await openHoldFor(userId);
        if (hold) {
            throw new ConflictException(HELD_MESSAGE);
        }

        const now = new Date();
        const since = new Date(now.getTime() - CODE_WINDOW_MS);
        const refusal = await prisma.$transaction(async (tx) => {
            // One person's sends one at a time, so two staff pressing at
            // once can't both pass the count (registry: backend-jobs.md).
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`admin-sign-in-code:${userId}`}))`;
            const limit = await codeLimit(tx, staff.userId, userId, since);
            if (limit) return limit;
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.PeopleSignInHelp,
                action: SignInHelpAction.CodeSent,
                targetType: "user",
                targetId: userId,
                reason: why,
                outcome: AdminAuditOutcome.Success,
            });
            return null;
        });

        if (refusal) {
            await this.audit.write(prisma, {
                actorUserId: staff.userId,
                permission: AdminPermission.PeopleSignInHelp,
                action: SignInHelpAction.CodeSent,
                targetType: "user",
                targetId: userId,
                reason: why,
                outcome: AdminAuditOutcome.Denied,
                metadata: { limit: refusal.which },
            });
            throw new HttpException(
                refusal.message(now),
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        try {
            await this.codes.send(user.email);
        } catch (error) {
            this.logger.error(
                `Sign-in code for ${userId} could not be sent: ${
                    error instanceof Error ? error.name : "unknown error"
                }`,
            );
            await this.audit.write(prisma, {
                actorUserId: staff.userId,
                permission: AdminPermission.PeopleSignInHelp,
                action: SignInHelpAction.CodeFailed,
                targetType: "user",
                targetId: userId,
                reason: why,
                outcome: AdminAuditOutcome.Failure,
            });
            throw new HttpException(
                "The sign-in code couldn't be sent. Nothing else changed; try again in a minute.",
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
        return { sent: true, to: maskEmail(user.email) };
    }

    /**
     * Record that staff checked the address by other means and mark it
     * verified. It is stamped as staff's (`emailVerifiedByStaffAt`), so it
     * never counts as the person's own (`common/auth/email-verification.ts`).
     *
     * It also removes the password and ends every session, as Better Auth
     * does when a code first proves an address (`revokeUnprovenAccountAccess`).
     * Staff can vouch for the mailbox, never for who set a password on an
     * address nobody had proven: anyone can sign up with someone else's
     * email, and without this the owner's mark would hand that person a
     * working password. The owner signs in with a code and sets a new one.
     */
    async markVerified(
        staff: PlatformAdminInfo,
        userId: string,
        reason: string,
    ) {
        const why = requireReason(reason);
        await findPerson(userId);
        if (await openHoldFor(userId)) {
            throw new ConflictException(
                "Their sign-in email was just changed and is held. Mark it verified once the hold ends or a second staff member confirms.",
            );
        }
        const at = new Date();
        return prisma.$transaction(async (tx) => {
            const marked = await tx.user.updateMany({
                where: { id: userId, emailVerified: false },
                data: { emailVerified: true, emailVerifiedByStaffAt: at },
            });
            if (marked.count === 0) {
                throw new ConflictException("Their email is already verified.");
            }
            const passwords = await tx.account.deleteMany({
                where: { userId, providerId: "credential" },
            });
            const sessions = await tx.session.deleteMany({ where: { userId } });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.PeopleSignInHelp,
                action: SignInHelpAction.MarkedVerified,
                targetType: "user",
                targetId: userId,
                reason: why,
                outcome: AdminAuditOutcome.Success,
                // Keys naming a password or credential are refused as secret-bearing.
                metadata: {
                    unprovenSignInRemoved: passwords.count > 0,
                    sessionsEnded: sessions.count,
                },
            });
            return {
                emailVerified: true,
                verifiedBy: "staff" as const,
                at,
                passwordRemoved: passwords.count > 0,
                sessionsEnded: sessions.count,
            };
        });
    }

    /** Change a person's sign-in email, with every safeguard (class doc). */
    async changeEmail(input: {
        staff: PlatformAdminInfo;
        userId: string;
        email: string;
        reason: string;
    }) {
        const { staff, userId } = input;
        const why = requireReason(input.reason);
        const email = input.email.trim().toLowerCase();
        const user = await findPerson(userId);
        if (email === user.email.toLowerCase()) {
            throw new BadRequestException(
                "That is already their sign-in email.",
            );
        }
        if (await emailInUse(email, userId)) {
            throw new ConflictException(
                "Another account already signs in with that email.",
            );
        }
        const paid = await ownsPaidBusiness(userId);
        if (paid && !staff.roles.includes(AdminRole.PlatformOwner)) {
            await this.audit.write(prisma, {
                actorUserId: staff.userId,
                permission: AdminPermission.PeopleSignInHelp,
                action: SignInHelpAction.EmailChanged,
                targetType: "user",
                targetId: userId,
                reason: why,
                outcome: AdminAuditOutcome.Denied,
                metadata: { paidOwner: true },
            });
            throw new ForbiddenException(
                "They own a business on a paid plan. Only a Platform owner can change their sign-in email.",
            );
        }

        const now = new Date();
        const codeHeldUntil = new Date(now.getTime() + EMAIL_CHANGE_HOLD_MS);
        const result = await prisma
            .$transaction(async (tx) => {
                await tx.user.update({
                    where: { id: userId },
                    data: {
                        email,
                        emailVerified: false,
                        emailVerifiedByStaffAt: null,
                    },
                });
                const ended = await tx.session.deleteMany({
                    where: { userId },
                });
                const change = await tx.signInEmailChange.create({
                    data: {
                        userId,
                        oldEmail: user.email,
                        newEmail: email,
                        requestedByUserId: staff.userId,
                        reason: why,
                        codeHeldUntil,
                    },
                    select: { id: true },
                });
                // The held code goes out when the hold ends, unless a
                // second staff member confirms first.
                await tx.job.create({
                    data: {
                        type: SIGN_IN_EMAIL_RELEASE_TYPE,
                        payload: { changeId: change.id },
                        runAt: codeHeldUntil,
                    },
                });
                await this.audit.write(tx, {
                    actorUserId: staff.userId,
                    permission: AdminPermission.PeopleSignInHelp,
                    action: SignInHelpAction.EmailChanged,
                    targetType: "user",
                    targetId: userId,
                    reason: why,
                    outcome: AdminAuditOutcome.Success,
                    metadata: {
                        changeId: change.id,
                        codeHeldUntil: codeHeldUntil.toISOString(),
                        sessionsEnded: ended.count,
                        paidOwner: paid,
                    },
                });
                return {
                    changeId: change.id,
                    codeHeldUntil,
                    sessionsEnded: ended.count,
                };
            })
            .catch((error: unknown) => {
                // Taken between the check and the write.
                if (prismaErrorCode(error) === "P2002") {
                    throw new ConflictException(
                        "Another account already signs in with that email.",
                    );
                }
                throw error;
            });

        try {
            await sendSignInEmailChangedNotice(user.email, maskEmail(email));
        } catch (error) {
            // The change stands; the ledger has it. Logged without the address.
            this.logger.error(
                `The old address of ${userId} could not be told of the change: ${
                    error instanceof Error ? error.name : "unknown error"
                }`,
            );
        }
        return result;
    }

    /**
     * A second, different staff member confirms a held change: the new
     * address gets its sign-in code now, and the person may sign in.
     */
    async confirmEmailChange(
        staff: PlatformAdminInfo,
        userId: string,
        reason: string,
    ) {
        const why = requireReason(reason);
        await findPerson(userId);
        const hold = await openHoldFor(userId);
        if (!hold) {
            throw new ConflictException(
                "There is no held sign-in email change to confirm.",
            );
        }
        if (hold.requestedByUserId === staff.userId) {
            throw new ForbiddenException(
                "You made this change. A second staff member has to confirm it.",
            );
        }
        const now = new Date();
        await prisma.$transaction(async (tx) => {
            const confirmed = await tx.signInEmailChange.updateMany({
                where: { id: hold.id, confirmedAt: null, codeSentAt: null },
                data: {
                    confirmedByUserId: staff.userId,
                    confirmedAt: now,
                    codeSentAt: now,
                },
            });
            if (confirmed.count === 0) {
                throw new ConflictException(
                    "That change was confirmed or released a moment ago.",
                );
            }
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.PeopleSignInHelp,
                action: SignInHelpAction.EmailConfirmed,
                targetType: "user",
                targetId: userId,
                reason: why,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    changeId: hold.id,
                    requestedBy: hold.requestedByUserId,
                },
            });
        });
        // Best effort once confirmed: if it doesn't arrive, the person asks
        // for one at sign-in, or staff send one.
        await this.codes.send(hold.newEmail).catch((error: unknown) => {
            this.logger.error(
                `The confirmed change's code for ${userId} could not be sent: ${
                    error instanceof Error ? error.name : "unknown error"
                }`,
            );
        });
        return { confirmed: true, to: maskEmail(hold.newEmail) };
    }
}

async function findPerson(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException("Person not found");
    return user;
}

async function emailInUse(email: string, userId: string): Promise<boolean> {
    const other = await prisma.user.findFirst({
        where: {
            email: { equals: email, mode: "insensitive" },
            id: { not: userId },
        },
        select: { id: true },
    });
    return other !== null;
}

/**
 * Whether the person owns a business that pays Saroh: an owner membership
 * of a business whose subscription is live and either billed by a provider
 * or on a priced plan.
 */
export async function ownsPaidBusiness(userId: string): Promise<boolean> {
    const owned = await prisma.membership.findFirst({
        where: {
            userId,
            role: "OWNER",
            organization: {
                subscription: {
                    status: { in: PAID_STATES },
                    OR: [
                        { provider: { not: null } },
                        { plan: { priceCents: { gt: 0 } } },
                    ],
                },
            },
        },
        select: { id: true },
    });
    return owned !== null;
}

interface LimitRefusal {
    which: "person" | "staff";
    message: (now: Date) => string;
}

/** Whether another code would pass the per-person and per-staff limits. */
async function codeLimit(
    tx: Prisma.TransactionClient,
    staffUserId: string,
    userId: string,
    since: Date,
): Promise<LimitRefusal | null> {
    const sent = {
        action: SignInHelpAction.CodeSent,
        outcome: AdminAuditOutcome.Success,
        createdAt: { gt: since },
    };
    const toPerson = await tx.adminAuditEvent.findMany({
        where: { ...sent, targetType: "user", targetId: userId },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
    });
    if (toPerson.length >= CODES_PER_PERSON) {
        return {
            which: "person",
            message: (now) =>
                `They've been sent ${CODES_PER_PERSON} sign-in codes in the last hour. Try again ${inMinutes(toPerson[0].createdAt, now)}.`,
        };
    }
    const byStaff = await tx.adminAuditEvent.findMany({
        where: { ...sent, actorUserId: staffUserId },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
    });
    if (byStaff.length >= CODES_PER_STAFF) {
        return {
            which: "staff",
            message: (now) =>
                `You've sent ${CODES_PER_STAFF} sign-in codes in the last hour. Try again ${inMinutes(byStaff[0].createdAt, now)}.`,
        };
    }
    return null;
}

/** "in 12 minutes": when the oldest counted send leaves the window. */
function inMinutes(oldest: Date, now: Date): string {
    const ms = oldest.getTime() + CODE_WINDOW_MS - now.getTime();
    const minutes = Math.max(1, Math.ceil(ms / 60_000));
    return minutes === 1 ? "in a minute" : `in ${minutes} minutes`;
}

const HELD_MESSAGE =
    "Their sign-in email was just changed, so no code goes out for 24 hours unless a second staff member confirms the change.";

function requireReason(value: string): string {
    const reason = value.trim();
    if (reason.length < 4) {
        throw new BadRequestException("Give a reason for this change.");
    }
    return reason;
}
