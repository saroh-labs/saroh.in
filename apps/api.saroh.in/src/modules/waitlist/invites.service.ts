import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendWaitlistLaunchInviteEmail } from "../../common/email";
import { env } from "../../env";
import type { LaunchOffer } from "./invite-token";
import {
    hashInviteToken,
    INVITE_VALID_DAYS,
    inviteExpiry,
    inviteUrl,
    launchOffer,
    newInviteToken,
    STALE_CLAIM_MS,
} from "./invite-token";
import { maskEmail } from "./waitlist-keys";

/** What a dry run says about one entry (the admin operations' shape). */
export interface InvitePlanItem {
    targetId: string;
    verdict: "act" | "skip" | "unsafe";
    detail: string;
}

/** What sending one invite did (the admin operations' item outcome). */
export interface InviteOutcome {
    status: "DONE" | "SKIPPED" | "FAILED";
    detail: string;
}

/** Whether this instance can send invites, and why not. */
export type InviteReadiness =
    | { ready: true; signupBase: string; offer: LaunchOffer }
    | { ready: false; reason: string };

/**
 * Opening-day invites (marketing plan U31, KTD-17). Staff send them in
 * batches from the waitlist console, as a durable admin operation
 * (`waitlist.invite`, `AdminOperationsService`): a dry run first, then one
 * row per entry, each claimed before it runs, under one idempotency key.
 *
 * One invite per entry, safe to re-run. An entry is claimed (`invitedAt`,
 * a fresh token's hash and its end) only while nobody has invited it, and
 * marked sent (`inviteSentAt`) once the email has left. A send that fails is
 * released, so that person is still waiting; one interrupted mid-send is
 * sent again by a later batch once its claim is stale (`STALE_CLAIM_MS`).
 */
@Injectable()
export class WaitlistInvitesService {
    private readonly logger = new Logger(WaitlistInvitesService.name);

    readiness(): InviteReadiness {
        const signupBase = signupUrl();
        if (!signupBase) {
            return {
                ready: false,
                reason: "This instance does not know where people sign up. Set ACCOUNTS_URL on the API.",
            };
        }
        const offer = launchOffer(env.LAUNCH_OFFER_DAYS);
        if (!offer) {
            return {
                ready: false,
                reason: "The launch offer isn't set on this instance, and the invite promises it. Set LAUNCH_OFFER_DAYS on the API.",
            };
        }
        return { ready: true, signupBase, offer };
    }

    /** What inviting each entry would do, changing nothing. */
    async classify(ids: string[], now = new Date()): Promise<InvitePlanItem[]> {
        const readiness = this.readiness();
        const rows = await prisma.waitlistSignup.findMany({
            where: { id: { in: ids } },
            select: {
                id: true,
                email: true,
                businessName: true,
                invitedAt: true,
                inviteSentAt: true,
                joinedAt: true,
            },
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        return ids.map((id): InvitePlanItem => {
            const row = byId.get(id);
            if (!row) {
                return {
                    targetId: id,
                    verdict: "skip",
                    detail: "Not on the waitlist any more",
                };
            }
            const who = row.businessName
                ? `${row.businessName} · ${row.email}`
                : row.email;
            if (!readiness.ready) {
                return {
                    targetId: id,
                    verdict: "unsafe",
                    detail: readiness.reason,
                };
            }
            if (row.joinedAt) {
                return {
                    targetId: id,
                    verdict: "skip",
                    detail: `${who}: already joined`,
                };
            }
            if (row.inviteSentAt) {
                return {
                    targetId: id,
                    verdict: "skip",
                    detail: `${who}: already invited`,
                };
            }
            if (row.invitedAt && !isStale(row.invitedAt, now)) {
                return {
                    targetId: id,
                    verdict: "skip",
                    detail: `${who}: being invited now`,
                };
            }
            return {
                targetId: id,
                verdict: "act",
                detail: row.invitedAt
                    ? `Invite ${who} (the last send did not finish)`
                    : `Invite ${who}`,
            };
        });
    }

    /**
     * Invite one entry: claim it, email the link, record that it left.
     * Classified again first, so an entry that changed since the dry run is
     * not invited on the strength of a stale answer.
     */
    async sendOne(id: string, now = new Date()): Promise<InviteOutcome> {
        const readiness = this.readiness();
        if (!readiness.ready)
            return { status: "FAILED", detail: readiness.reason };
        const planned = (await this.classify([id], now))[0] as
            InvitePlanItem | undefined;
        if (planned?.verdict !== "act") {
            return {
                status: "SKIPPED",
                detail: planned?.detail ?? "Nothing to do",
            };
        }

        const token = newInviteToken();
        const tokenHash = hashInviteToken(token);
        const claimed = await prisma.waitlistSignup.updateMany({
            where: {
                id,
                joinedAt: null,
                inviteSentAt: null,
                OR: [
                    { invitedAt: null },
                    {
                        invitedAt: {
                            lt: new Date(now.getTime() - STALE_CLAIM_MS),
                        },
                    },
                ],
            },
            data: {
                invitedAt: now,
                inviteTokenHash: tokenHash,
                inviteExpiresAt: inviteExpiry(now),
            },
        });
        if (claimed.count === 0) {
            return {
                status: "SKIPPED",
                detail: "Invited by another batch meanwhile",
            };
        }
        const row = await prisma.waitlistSignup.findUnique({
            where: { id },
            select: { email: true, businessName: true },
        });
        if (!row)
            return {
                status: "SKIPPED",
                detail: "Not on the waitlist any more",
            };

        const outcome = await sendWaitlistLaunchInviteEmail(row.email, {
            url: inviteUrl(readiness.signupBase, token, row.email),
            businessName: row.businessName,
            validDays: INVITE_VALID_DAYS,
        });
        if (outcome === "sent") {
            await prisma.waitlistSignup.updateMany({
                where: { id, inviteTokenHash: tokenHash },
                data: { inviteSentAt: new Date() },
            });
            this.logger.log(`waitlist: invite sent to ${maskEmail(row.email)}`);
            return { status: "DONE", detail: "Invite sent" };
        }
        // Released, so the person is still waiting rather than falsely invited.
        await prisma.waitlistSignup.updateMany({
            where: { id, inviteTokenHash: tokenHash, inviteSentAt: null },
            data: {
                invitedAt: null,
                inviteTokenHash: null,
                inviteExpiresAt: null,
            },
        });
        return {
            status: "FAILED",
            detail:
                outcome === "not-configured"
                    ? "No email is set up on this instance; still waiting"
                    : "The email did not leave; still waiting",
        };
    }
}

function isStale(invitedAt: Date, now: Date): boolean {
    return invitedAt.getTime() < now.getTime() - STALE_CLAIM_MS;
}

/** Where an invitee creates their account, or null when this instance cannot say. */
export function signupUrl(): string | null {
    const base =
        env.ACCOUNTS_URL ??
        (env.NODE_ENV === "development"
            ? "https://accounts.saroh.localhost"
            : undefined);
    return base ? `${base.replace(/\/$/, "")}/signup` : null;
}
