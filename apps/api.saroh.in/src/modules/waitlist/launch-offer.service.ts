import {
    ConflictException,
    ForbiddenException,
    GoneException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from "@nestjs/common";
import { liveCatalogueVersion, prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";
import { editionProfile } from "@saroh/edition";
import { catalogPlanIdForKey, validateCatalog } from "@saroh/pricing-catalog";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { env } from "../../env";
import { authorize } from "../organizations/organization-policy";
import type { PublicLaunchOffer } from "./invite-token";
import {
    hashInviteToken,
    INVITE_TOKEN_PATTERN,
    launchOffer,
    offerEnds,
    publicLaunchOffer,
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
        "The launch offer isn't available right now. Your business is set up. Ask us and we'll add it.",
} as const;

export type InviteCheck =
    | {
          status: "ready";
          businessName: string | null;
          planKey: string;
          days: number;
      }
    /** A valid invite that carries no offer: Global's, Free only (owner, 9 Nov 2026). */
    | { status: "free"; businessName: string | null }
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

/** The offer taken, or both null when the invite joined on Free (Global). */
export type LaunchOfferGranted =
    { planKey: string; until: string } | { planKey: null; until: null };

/**
 * Whether an invite carries the launch offer: India's alone (KTD3c). Global
 * opens Free-only (DEC-211), so a Global entry, or an entry made into a
 * Global business, joins on Free (owner, 9 Nov 2026). Unset is India.
 */
function carriesOffer(...editions: (Edition | null | undefined)[]): boolean {
    return editions.every((edition) => editionProfile(edition).sarohBilling);
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

    /**
     * The offer saroh.in's waitlist page shows (`GET /public/waitlist/offer`):
     * the same `LAUNCH_OFFER_DAYS` and plan the invites carry, named as the
     * live catalogue names it. Null when there is no offer, no live catalogue,
     * or the live catalogue has no such plan. A stored snapshot that doesn't
     * validate is logged and read as no offer, never a 500 on a public page.
     */
    async publicOffer(
        now = new Date(),
        edition?: Edition,
    ): Promise<PublicLaunchOffer | null> {
        if (!carriesOffer(edition)) return null;
        const offer = launchOffer(env.LAUNCH_OFFER_DAYS);
        if (!offer) return null;
        // saroh.in's waitlist: India's catalogue (KTD3c, India-only offer).
        const live = await liveCatalogueVersion(prisma, "INDIA", now);
        if (!live) return null;
        const parsed = validateCatalog(live.catalog);
        if (!parsed.ok) {
            this.logger.error(
                `waitlist: launch offer not shown; catalogue version ${live.version} does not validate`,
            );
            return null;
        }
        return publicLaunchOffer(offer, parsed.catalog);
    }

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
        if (row && !carriesOffer(row.edition)) {
            return { status: "free", businessName: row.businessName };
        }
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
     * any other use of a taken token is refused. An invite that carries no
     * offer (a Global entry or business) only marks the entry joined.
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
        // It grants a plan, which Saroh only bills in India for now.
        const offers = carriesOffer(ctx.edition, row?.edition);
        const offer = offers ? launchOffer(env.LAUNCH_OFFER_DAYS) : null;
        if (!row || (offers && !offer)) {
            throw new ServiceUnavailableException(INVITE_REFUSALS.unavailable);
        }

        const plan = offer
            ? { planKey: offer.planKey, until: offerEnds(offer, now) }
            : null;
        try {
            await this.write(ctx, user, row.id, plan, now);
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
            `waitlist: ${maskEmail(user.email)} joined with an invite; ${plan ? "launch offer applied" : "on Free"}`,
        );
        return plan
            ? { planKey: plan.planKey, until: plan.until.toISOString() }
            : { planKey: null, until: null };
    }

    /**
     * Claim the entry and, with an offer, write the override and its audit
     * row, together. Without one (Global) only the claim is written.
     */
    private async write(
        ctx: OrganizationContext,
        user: AuthUser,
        signupId: string,
        plan: { planKey: string; until: Date } | null,
        now: Date,
    ): Promise<void> {
        await prisma.$transaction(async (tx) => {
            const subscription = plan
                ? await tx.subscription.findUnique({
                      where: { organizationId: ctx.organizationId },
                      select: {
                          status: true,
                          plan: { select: { key: true } },
                      },
                  })
                : null;
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
            if (!plan) return;
            const { planKey, until } = plan;
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
        // Joined on Free (Global): no override was written.
        if (!row?.planKey || !row.expiresAt)
            return { planKey: null, until: null };
        return { planKey: row.planKey, until: row.expiresAt.toISOString() };
    }
}

interface InviteRow {
    id: string;
    emailKey: string;
    businessName: string | null;
    edition: Edition;
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
            edition: true,
        },
    });
}

type Refusal = Exclude<InviteCheck, { status: "ready" | "free" }>;

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
