import { Inject, Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { catalogPlanIdForKey } from "@saroh/pricing-catalog";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { authorize } from "../organizations/organization-policy";
import { isOneTime } from "./billing-term";
import { BillingWebhookService } from "./billing-webhook.service";
import type {
    BillingProviderFactory,
    ParsedBillingEvent,
} from "./providers/billing-provider.port";
import {
    BILLING_PROVIDER_FACTORY,
    BillingProviderError,
} from "./providers/billing-provider.port";

/**
 * `POST …/billing/checkout/confirm`: where the business's checkout stands.
 *
 * - `completed`: it's on the plan now.
 * - `scheduled`: authorised (or paid ahead) and starting on `startAt`.
 * - `waiting`: the provider hasn't seen it paid or authorised yet — the
 *   page keeps checking for a short while, and never offers a second
 *   checkout meanwhile.
 * - `failed`: the provider says it was declined or ended; nothing changed.
 * - `none`: no checkout is waiting (it already went through, or none was
 *   started); the page reads the plan again.
 */
export interface ConfirmView {
    state: "completed" | "scheduled" | "waiting" | "failed" | "none";
    plan: { id: string; name: string } | null;
    startAt: string | null;
}

/**
 * Coming back from paying Saroh (DEC-093, UX-003): the plan moves as soon
 * as the provider says it's paid, without waiting for the webhook. The
 * business's OPEN checkout is looked up at the provider (its subscription,
 * or a yearly plan's order) and what the provider says is reconciled by
 * the webhook's own rule (`BillingWebhookService.reconcileCheckout`), so
 * the two can never disagree, and whichever lands second changes nothing.
 *
 * Only the business's own checkout is ever asked about: the org comes from
 * the request's context, the provider reference from Saroh's row.
 */
/** Provider lookups a minute per business: the page polls, briefly. */
export const CONFIRM_TRIES_PER_ORG = 20;

@Injectable()
export class CheckoutConfirmService {
    private readonly logger = new Logger(CheckoutConfirmService.name);
    private readonly tries = new FixedWindowRateLimiter(
        CONFIRM_TRIES_PER_ORG,
        60_000,
    );

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
        private readonly webhooks: BillingWebhookService,
    ) {}

    async confirm(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<ConfirmView> {
        authorize(ctx, "billing:manage");
        const open = await prisma.billingCheckout.findFirst({
            where: { organizationId: ctx.organizationId, status: "OPEN" },
            include: { plan: { select: { key: true, name: true } } },
        });
        if (!open) return { state: "none", plan: null, startAt: null };
        const plan = {
            id: catalogPlanIdForKey(open.plan.key) ?? open.plan.key,
            name: open.plan.name,
        };
        const provider = this.providers.get(open.provider);
        // Past the limit, the answer is "still waiting"; the webhook decides.
        const allowed = this.tries.take(
            `org:${ctx.organizationId}`,
            now.getTime(),
        );
        if (!provider.statuses || !allowed) {
            return { state: "waiting", plan, startAt: null };
        }
        const ref = open.providerSubscriptionId;
        let said;
        try {
            said = await provider.statuses.checkoutStatus(ref, isOneTime(open));
        } catch (error) {
            // Not answered: still waiting, and the webhook still decides.
            this.logger.warn(
                `billing_confirm_provider_failed org=${ctx.organizationId}: ${
                    error instanceof BillingProviderError
                        ? error.message
                        : "unknown"
                }`,
            );
            return { state: "waiting", plan, startAt: null };
        }
        const event: ParsedBillingEvent = {
            type: `confirm.${said.phase}`,
            providerEventId: `confirm:${ref}:${said.phase}`,
            providerSubscriptionId: ref,
            status: said.status,
            phase: said.phase,
            eventAt: null,
            ...(said.currentPeriodEnd !== undefined
                ? { currentPeriodEnd: said.currentPeriodEnd }
                : {}),
            providerPaymentId: said.providerPaymentId ?? null,
        };
        await this.webhooks.reconcileCheckout(open.id, event, now);
        const after = await prisma.billingCheckout.findUnique({
            where: { id: open.id },
            select: { status: true, startAt: true },
        });
        switch (after?.status) {
            case "COMPLETED":
                return { state: "completed", plan, startAt: null };
            case "SCHEDULED":
                return {
                    state: "scheduled",
                    plan,
                    startAt: after.startAt?.toISOString() ?? null,
                };
            case "CANCELLED":
                return { state: "failed", plan, startAt: null };
            default:
                return { state: "waiting", plan, startAt: null };
        }
    }
}
