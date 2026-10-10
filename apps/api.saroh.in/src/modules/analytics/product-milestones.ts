import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    captureProductEvent,
    telemetryOn,
} from "../../common/observability/posthog";
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
 * The workspace's product milestones, sent to PostHog (DEC-125).
 *
 * These nine events are the whole list. Nothing else about how a business
 * uses the workspace is sent, from the server or from the browser.
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
 * What a milestone says about the business: its plan's key and what kind of
 * business it is. Never a name, an email, a phone number, an address, an
 * amount, or anything about its customers.
 */
export interface MilestoneFacts {
    planKey: string | null;
    businessKind: string | null;
}

/** Reads the two facts. Replaced in unit tests. */
export type MilestoneFactsReader = (
    organizationId: string,
) => Promise<MilestoneFacts>;

const readFacts: MilestoneFactsReader = async (organizationId) => {
    const [organization, subscription] = await Promise.all([
        prisma.organization.findUnique({
            where: { id: organizationId },
            select: { kind: true },
        }),
        prisma.subscription.findUnique({
            where: { organizationId },
            select: { plan: { select: { key: true } } },
        }),
    ]);
    return {
        planKey: subscription?.plan.key ?? null,
        businessKind: organization?.kind ?? null,
    };
};

/**
 * A person's account was created (`signed_up`). Once per user: Better Auth
 * calls this from the hook that runs when the user's row is first written
 * (`common/auth/auth.ts`), by password or through a provider. The only
 * milestone whose id is the user's: there is no business yet, so it carries
 * no plan and no kind. Never the email or the name.
 */
export function signedUp(userId: string): void {
    if (!telemetryOn()) return;
    captureProductEvent("signed_up", userId, {});
}

@Injectable()
export class ProductMilestones {
    private readonly logger = new Logger(ProductMilestones.name);
    /** Swapped by unit tests; the real one reads two columns. */
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
