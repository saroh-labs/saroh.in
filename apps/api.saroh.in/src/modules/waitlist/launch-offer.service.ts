import {
    ConflictException,
    ForbiddenException,
    GoneException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { catalogPlanIdForKey } from "@saroh/pricing-catalog";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { env } from "../../env";
import { authorize } from "../organizations/organization-policy";
import {
    hashInviteToken,
    INVITE_TOKEN_PATTERN,
    launchOffer,
    offerEnds,
} from "./invite-token";
import { maskEmail, normaliseEmail } from "./waitlist-keys";

/** Why an invite can't be used, in the words the invitee is shown. */
export const INVITE_REFUSALS = {
    invalid: "This invite link isn't valid. Ask for a new invite.",
    used: "This invite has already been used. Ask for a new invite.",
    expired: "This invite has expired. Ask for a new invite.",
    otherEmail:
        "This invite was sent to a different email address. Sign up or sign in with that address to use it.",
    unverified: "Confirm your email address first, then use the invite.",
    unavailable:
        "The launch offer isn't available right now. Your business is set up; ask us and we'll add it.",
} as const;

export type InviteCheck =
    | {
          status: "ready";
          businessName: string | null;
          planKey: string;
          days: number;
      }
    | {
          status:
              | "invalid"
              | "used"
              | "expired"
              | "other-email"
              | "unverified"
              | "unavailable";
          message: string;
      };

export interface LaunchOfferGranted {
    planKey: string;
    until: string;
}

/** Who wrote a launch offer's override and audit row: the invitee. */
const OFFER_REASON = "Launch offer: joined from a waitlist invite.";

/**
 * The launch offer an invite carries (marketing plan U31, OQ-1): a business
 * made through an invite goes on the offer plan for the offer's length — a
 * time-bound `plan` override (U5's mechanism, read by `CatalogueAccessService`),
 * with no payment details up front — and the waitlist entry is marked joined.
 *
 * The token is single use and expires, and it is bound to the entry's email:
 * the signed-in account's address — the one its sign-up code was checked
 * against — must be the entry's, compared the waitlist's way (`emailKey`).
 */
@Injectable()
export class LaunchOfferService {
    private readonly logger = new Logger(LaunchOfferService.name);

    /** What onboarding says about an invite before the business exists. */
    async check(
        user: AuthUser,
        token: string,
        now = new Date(),
    ): Promise<InviteCheck> {
        const offer = launchOffer(env.LAUNCH_OFFER_DAYS);
        const row = await findByToken(token);
        const refusal = refusalFor(row, user, now);
        if (refusal) return refusal;
        if (!offer || !row) {
            return {
                status: "unavailable",
                message: INVITE_REFUSALS.unavailable,
            };
        }
        return {
            status: "ready",
            businessName: row.businessName,
            planKey: offer.planKey,
            days: offer.days,
        };
    }

    /**
     * Take the offer for the business just made. Needs `billing:manage`.
     * Repeating it for the same business answers the same (a double submit);
     * any other use of a taken token is refused.
     */
    async redeem(
        ctx: OrganizationContext,
        user: AuthUser,
        token: string,
        now = new Date(),
    ): Promise<LaunchOfferGranted> {
        authorize(ctx, "billing:manage");
        const row = await findByToken(token);
        if (row?.joinedOrganizationId === ctx.organizationId) {
            return this.granted(ctx.organizationId);
        }
        const refusal = refusalFor(row, user, now);
        if (refusal) throw refusalError(refusal);
        const offer = launchOffer(env.LAUNCH_OFFER_DAYS);
        if (!offer || !row) {
            throw new ServiceUnavailableException(INVITE_REFUSALS.unavailable);
        }

        const until = offerEnds(offer, now);
        try {
            await this.write(ctx, user, row.id, offer.planKey, until, now);
        } catch (error) {
            // A double submit that lost the race to its twin: same business,
            // same answer.
            const again = await findByToken(token);
            if (again?.joinedOrganizationId === ctx.organizationId) {
                return this.granted(ctx.organizationId);
            }
            throw error;
        }
        this.logger.log(
            `waitlist: ${maskEmail(user.email)} joined with an invite; launch offer applied`,
        );
        return { planKey: offer.planKey, until: until.toISOString() };
    }

    /** Claim the entry and write the override and its audit row, together. */
    private async write(
        ctx: OrganizationContext,
        user: AuthUser,
        signupId: string,
        planKey: string,
        until: Date,
        now: Date,
    ): Promise<void> {
        await prisma.$transaction(async (tx) => {
            const subscription = await tx.subscription.findUnique({
                where: { organizationId: ctx.organizationId },
                select: { status: true, plan: { select: { key: true } } },
            });
            if (
                subscription &&
                subscription.status !== "CANCELLED" &&
                catalogPlanIdForKey(subscription.plan.key) !== "free"
            ) {
                throw new ConflictException(
                    "This business already has a paid plan, so the launch offer can't replace it.",
                );
            }
            // The claim: single use, so a second business (or a race) loses.
            const claimed = await tx.waitlistSignup.updateMany({
                where: {
                    id: signupId,
                    joinedAt: null,
                    inviteExpiresAt: { gt: now },
                },
                data: {
                    joinedAt: now,
                    joinedOrganizationId: ctx.organizationId,
                },
            });
            if (claimed.count === 0)
                throw new GoneException(INVITE_REFUSALS.used);
            const override = await tx.entitlementOverride.create({
                data: {
                    organizationId: ctx.organizationId,
                    kind: "plan",
                    key: "plan",
                    planKey,
                    expiresAt: until,
                    reason: OFFER_REASON,
                    grantedByUserId: user.id,
                },
                select: { id: true },
            });
            await tx.auditEvent.create({
                data: {
                    action: "organization.plan.launch_offer",
                    actorUserId: user.id,
                    organizationId: ctx.organizationId,
                    targetType: "entitlement_override",
                    targetId: override.id,
                    outcome: "SUCCESS",
                    metadata: {
                        planKey,
                        until: until.toISOString(),
                        waitlistSignupId: signupId,
                    },
                },
            });
        });
    }

    /** The offer already written for this business, for a repeated redeem. */
    private async granted(organizationId: string): Promise<LaunchOfferGranted> {
        const row = await prisma.entitlementOverride.findFirst({
            where: { organizationId, kind: "plan", reason: OFFER_REASON },
            select: { planKey: true, expiresAt: true },
            orderBy: { createdAt: "desc" },
        });
        if (!row?.planKey || !row.expiresAt) {
            throw new GoneException(INVITE_REFUSALS.used);
        }
        return { planKey: row.planKey, until: row.expiresAt.toISOString() };
    }
}

interface InviteRow {
    id: string;
    emailKey: string;
    businessName: string | null;
    inviteExpiresAt: Date | null;
    joinedAt: Date | null;
    joinedOrganizationId: string | null;
}

async function findByToken(token: string): Promise<InviteRow | null> {
    if (!INVITE_TOKEN_PATTERN.test(token)) return null;
    return prisma.waitlistSignup.findUnique({
        where: { inviteTokenHash: hashInviteToken(token) },
        select: {
            id: true,
            emailKey: true,
            businessName: true,
            inviteExpiresAt: true,
            joinedAt: true,
            joinedOrganizationId: true,
        },
    });
}

type Refusal = Exclude<InviteCheck, { status: "ready" }>;

/**
 * Why this account can't use this invite now, or null when it can. Order
 * matters: an unknown link says nothing about any entry, and a used or
 * expired one is refused before the address is compared, so a stranger
 * holding someone's old link learns nothing about whose it was.
 */
function refusalFor(
    row: InviteRow | null,
    user: AuthUser,
    now: Date,
): Refusal | null {
    if (!row) return { status: "invalid", message: INVITE_REFUSALS.invalid };
    if (row.joinedAt) return { status: "used", message: INVITE_REFUSALS.used };
    if (!row.inviteExpiresAt || row.inviteExpiresAt <= now) {
        return { status: "expired", message: INVITE_REFUSALS.expired };
    }
    if (normaliseEmail(user.email).key !== row.emailKey) {
        return { status: "other-email", message: INVITE_REFUSALS.otherEmail };
    }
    if (!user.emailVerified) {
        return { status: "unverified", message: INVITE_REFUSALS.unverified };
    }
    return null;
}

function refusalError(refusal: Refusal): Error {
    switch (refusal.status) {
        case "invalid":
            return new NotFoundException(refusal.message);
        case "used":
        case "expired":
            return new GoneException(refusal.message);
        case "other-email":
        case "unverified":
            return new ForbiddenException(refusal.message);
        case "unavailable":
            return new ServiceUnavailableException(refusal.message);
    }
}
