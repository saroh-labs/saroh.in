import { Injectable, Logger } from "@nestjs/common";
import { outsideOrgContext, prisma } from "@saroh/database";

import {
    captureProductEvent,
    telemetryOn,
} from "../../common/observability/posthog";
import { managerCodeOf } from "../organizations/account-manager";
import { referralCodeOf } from "../organizations/referral";
import type { SignupSource } from "../organizations/signup-source";
import { signupSourceOf } from "../organizations/signup-source";
import {
    FIRST_BOOKING_CREATED_TYPE,
    FIRST_ORDER_CREATED_TYPE,
    FIRST_PAYMENT_PROVIDER_CONNECTED_TYPE,
    FIRST_PLAN_UPGRADED_TYPE,
    FIRST_PRODUCT_CREATED_TYPE,
    FIRST_SERVICE_CREATED_TYPE,
    FIRST_SITE_PUBLISHED_TYPE,
    ORGANIZATION_CREATED_TYPE,
} from "./event-contract";

/**
 * The workspace's product milestones, sent to PostHog (DEC-125, widened
 * by DEC-187: each says where the business or account came from).
 *
 * These nine events, and the two upgrade-prompt events below (DEC-187),
 * are the whole list ({@link PRODUCT_EVENTS}). Nothing else about how a
 * business uses the workspace is sent, from the server or from the browser.
 */
export const PRODUCT_MILESTONES = [
    "signed_up",
    "onboarding_finished",
    "first_product_added",
    "first_service_added",
    "site_published",
    "first_order_taken",
    "first_booking_taken",
    "payment_provider_connected",
    "plan_upgraded",
] as const;
export type ProductMilestone = (typeof PRODUCT_MILESTONES)[number];

/**
 * An upgrade prompt shown or pressed (DEC-187, #1197). Not ledger rows:
 * their own send path, `billing/upgrade-prompts.ts`, which sends "shown"
 * once per business, prompt and IST day.
 */
export const UPGRADE_PROMPT_EVENTS = [
    "upgrade_prompt_shown",
    "upgrade_prompt_pressed",
] as const;
export type UpgradePromptEvent = (typeof UPGRADE_PROMPT_EVENTS)[number];

/** The closed list: every product event the API sends. */
export const PRODUCT_EVENTS = [
    ...PRODUCT_MILESTONES,
    ...UPGRADE_PROMPT_EVENTS,
] as const;

/**
 * Which activation-ledger row is each business milestone's source. The
 * ledger stores each of these once per Organization (`dedupeKey`), so the
 * milestone is sent once: only when the row was stored, never on a repeat.
 *
 * `onboarding_finished` is the business being set up (the setup form's
 * write). The goal picker after it writes nothing of its own to tell
 * "finished" by: it only switches modules on, and may be skipped.
 */
export const MILESTONE_BY_LEDGER_TYPE: Readonly<
    Partial<Record<string, Exclude<ProductMilestone, "signed_up">>>
> = {
    [ORGANIZATION_CREATED_TYPE]: "onboarding_finished",
    [FIRST_PRODUCT_CREATED_TYPE]: "first_product_added",
    [FIRST_SERVICE_CREATED_TYPE]: "first_service_added",
    [FIRST_SITE_PUBLISHED_TYPE]: "site_published",
    [FIRST_ORDER_CREATED_TYPE]: "first_order_taken",
    [FIRST_BOOKING_CREATED_TYPE]: "first_booking_taken",
    [FIRST_PAYMENT_PROVIDER_CONNECTED_TYPE]: "payment_provider_connected",
    [FIRST_PLAN_UPGRADED_TYPE]: "plan_upgraded",
};

/**
 * Where a business (or an account) came from (DEC-187): the `src` and utm it
 * arrived by, and who referred it: a business by its referral code
 * (DEC-156), an account manager by theirs (DEC-169), both, or nobody. Each
 * code in a key of its own, and only on these server-side events, never a
 * browser tag (DEC-127).
 */
export interface MilestoneSource {
    signupSource: SignupSource | null;
    referrerCode: string | null;
    managerCode: string | null;
}

/**
 * What a milestone says about the business: its plan's key, what kind of
 * business it is and where it came from. Never a name, an email, a phone
 * number, an address, an amount, or anything about its customers.
 */
export interface MilestoneFacts extends MilestoneSource {
    planKey: string | null;
    businessKind: string | null;
}

/** Reads the facts. Replaced in unit tests. */
export type MilestoneFactsReader = (
    organizationId: string,
) => Promise<MilestoneFacts>;

// The referrer's code and the manager's are other rows than the business's
// own, so the reads are made outside any organization context.
const readFacts: MilestoneFactsReader = (organizationId) =>
    outsideOrgContext(async () => {
        const [organization, subscription, broughtIn] = await Promise.all([
            prisma.organization.findUnique({
                where: { id: organizationId },
                select: {
                    kind: true,
                    signupSource: true,
                    referredByOrganization: {
                        select: { referralCode: true },
                    },
                },
            }),
            prisma.subscription.findUnique({
                where: { organizationId },
                select: { plan: { select: { key: true } } },
            }),
            // The manager who brought it in, even if another looks after it now.
            prisma.accountManagerLink.findFirst({
                where: { organizationId, kind: "BROUGHT_IN" },
                orderBy: { startedAt: "asc" },
                select: { platformAdminId: true },
            }),
        ]);
        const manager = broughtIn
            ? await prisma.staffProfile.findUnique({
                  where: { platformAdminId: broughtIn.platformAdminId },
                  select: { managerCode: true },
              })
            : null;
        return {
            planKey: subscription?.plan.key ?? null,
            businessKind: organization?.kind ?? null,
            signupSource: signupSourceOf(organization?.signupSource),
            referrerCode: referralCodeOf(
                organization?.referredByOrganization?.referralCode,
            ),
            managerCode: managerCodeOf(manager?.managerCode),
        };
    });

/** The source properties every milestone carries; a code only when there is one. */
export function sourceProperties(
    source: MilestoneSource,
): Record<string, string> {
    const { signupSource, referrerCode, managerCode } = source;
    return {
        ...(signupSource?.src ? { src: signupSource.src } : {}),
        ...(signupSource?.utmSource
            ? { utm_source: signupSource.utmSource }
            : {}),
        ...(signupSource?.utmMedium
            ? { utm_medium: signupSource.utmMedium }
            : {}),
        ...(signupSource?.utmCampaign
            ? { utm_campaign: signupSource.utmCampaign }
            : {}),
        referral_channel:
            referrerCode && managerCode
                ? "both"
                : referrerCode
                  ? "business"
                  : managerCode
                    ? "account_manager"
                    : "none",
        ...(referrerCode ? { referrer_code: referrerCode } : {}),
        ...(managerCode ? { manager_code: managerCode } : {}),
    };
}

/** The value of cookie `name` in a `Cookie` header, or null. */
function cookieValue(header: string, name: string): string | null {
    for (const part of header.split(";")) {
        const at = part.indexOf("=");
        if (at < 0) continue;
        const value = part.slice(at + 1).trim();
        if (part.slice(0, at).trim() === name && value) return value;
    }
    return null;
}

/**
 * Where an account came from, from the sign-up request's cookies, which
 * saroh.in keeps on the parent domain api.saroh.in shares
 * (`apps/saroh.in/lib/referral.ts`): `saroh_src` (a query of `src` and
 * utm), `saroh_ref` (a business's code) and `saroh_am` (`<code>.<seconds>`).
 * Shape checks only, the same as setup's; a value of any other shape is
 * dropped. Whether a code names anyone is setup's to say, on the business.
 */
export function sourceFromCookies(header: string | null): MilestoneSource {
    if (!header) {
        return { signupSource: null, referrerCode: null, managerCode: null };
    }
    const query = new URLSearchParams(cookieValue(header, "saroh_src") ?? "");
    return {
        signupSource: signupSourceOf({
            src: query.get("src") ?? undefined,
            utmSource: query.get("utm_source") ?? undefined,
            utmMedium: query.get("utm_medium") ?? undefined,
            utmCampaign: query.get("utm_campaign") ?? undefined,
        }),
        referrerCode: referralCodeOf(cookieValue(header, "saroh_ref")),
        managerCode: managerCodeOf(
            cookieValue(header, "saroh_am")?.split(".")[0],
        ),
    };
}

/**
 * A person's account was created (`signed_up`). Once per user: Better Auth
 * calls this from the hook that runs when the user's row is first written
 * (`common/auth/auth.ts`), by password or through a provider, with the
 * request's `Cookie` header. The only milestone whose id is the user's:
 * there is no business yet, so it carries no plan and no kind, only where
 * the person came from (DEC-187). Never the email or the name.
 */
export function signedUp(userId: string, cookieHeader: string | null): void {
    if (!telemetryOn()) return;
    captureProductEvent(
        "signed_up",
        userId,
        sourceProperties(sourceFromCookies(cookieHeader)),
    );
}

@Injectable()
export class ProductMilestones {
    private readonly logger = new Logger(ProductMilestones.name);
    /** Swapped by unit tests; the real one reads the database. */
    facts: MilestoneFactsReader = readFacts;

    /**
     * Called by `ActivationEvents` when the ledger STORED a row (never for
     * a repeat). Returns at once: the read and the send happen after, and a
     * failure of either is logged and goes no further. With PostHog off,
     * nothing is read.
     */
    ledgerStored(type: string, organizationId: string): void {
        const milestone = MILESTONE_BY_LEDGER_TYPE[type];
        if (!milestone || !telemetryOn()) return;
        void this.send(milestone, organizationId);
    }

    private async send(
        milestone: ProductMilestone,
        organizationId: string,
    ): Promise<void> {
        try {
            const facts = await this.facts(organizationId);
            captureProductEvent(milestone, organizationId, {
                plan_key: facts.planKey ?? "none",
                business_kind: facts.businessKind ?? "unknown",
                ...sourceProperties(facts),
            });
        } catch (error) {
            // A degraded path: the milestone is in the ledger, and only
            // PostHog's copy is missing. WARN; a steady stream means the
            // read is broken.
            this.logger.warn(
                `product_milestone_not_sent ${milestone} org=${organizationId}: ${
                    error instanceof Error ? error.name : "unknown"
                }`,
            );
        }
    }
}
