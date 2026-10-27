import { randomUUID } from "node:crypto";

import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import type { MessagingTopup } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";
import { withGstPaise } from "@saroh/pricing-catalog";

import type { OrganizationContext } from "../../common/types/organization-context";
import { BillingWebhookService } from "../billing/billing-webhook.service";
import { CONFIRM_TRIES_PER_ORG } from "../billing/checkout-confirm.service";
import { CheckoutService } from "../billing/checkout.service";
import type {
    BillingProviderFactory,
    CheckoutHandoff,
} from "../billing/providers/billing-provider.port";
import { BILLING_PROVIDER_FACTORY } from "../billing/providers/billing-provider.port";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { authorize } from "../organizations/organization-policy";
import { CatalogueService } from "../pricing/catalogue.service";

/** A pack on sale: what it adds to the balance, and what it costs with GST. */
export interface MessagePackView {
    id: string;
    amountPaise: number;
    totalPaise: number;
}

export interface TopupView {
    id: string;
    packId: string;
    amountPaise: number;
    status: MessagingTopup["status"];
    createdAt: Date;
    paidAt: Date | null;
}

/**
 * Buying a money pack for the messaging wallet (DEC-191, #1241). The packs
 * are the live catalogue's; one is bought as a one-off order on Saroh's own
 * billing provider (`CheckoutService.startOneOff`), and only the billing
 * webhook (or the owner's return, checked with the provider and applied by
 * the webhook's rule) credits it: once, on PAID.
 */
@Injectable()
export class TopupService {
    private readonly logger = new Logger(TopupService.name);
    private readonly tries = new FixedWindowRateLimiter(
        CONFIRM_TRIES_PER_ORG,
        60_000,
    );

    constructor(
        private readonly catalogue: CatalogueService,
        private readonly checkout: CheckoutService,
        private readonly webhooks: BillingWebhookService,
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
    ) {}

    async packs(): Promise<MessagePackView[]> {
        const live = await this.catalogue.live(new Date());
        return (live?.catalog.messagePacks ?? []).map((p) => ({
            id: p.id,
            amountPaise: p.amountPaise,
            totalPaise: withGstPaise(p.amountPaise),
        }));
    }

    /** Owner only, as every charge from Saroh is. */
    async start(
        ctx: OrganizationContext,
        packId: string,
    ): Promise<{ topup: TopupView; handoff: CheckoutHandoff | null }> {
        authorize(ctx, "billing:manage");
        const pack = (await this.packs()).find((p) => p.id === packId);
        if (!pack) {
            throw new BadRequestException({
                message: "That pack isn't on sale. Reload and pick another.",
                details: { field: "packId" },
            });
        }
        const id = randomUUID();
        const order = await this.checkout.startOneOff(ctx, {
            amountPaise: pack.totalPaise,
            reference: id,
            itemKey: `messaging.${pack.id}`,
        });
        // shortcut: an order made but not recorded here lapses unpaid at
        // the provider; one paid anyway is raised as unmatched (DEC-166).
        const topup = await runInOrgContext(ctx.organizationId, () =>
            prisma.messagingTopup.create({
                data: {
                    id,
                    organizationId: ctx.organizationId,
                    packId: pack.id,
                    amountPaise: pack.amountPaise,
                    provider: order.provider,
                    providerOrderId: order.providerOrderId,
                },
            }),
        );
        return { topup: view(topup), handoff: order.handoff };
    }

    /**
     * Where a top-up stands. A PENDING one is asked of the provider (a
     * few times a minute at most) so the balance moves without waiting for
     * the webhook; a provider that doesn't answer leaves it to the webhook.
     */
    async status(
        ctx: OrganizationContext,
        topupId: string,
        now: Date = new Date(),
    ): Promise<TopupView> {
        authorize(ctx, "comms:manage");
        const find = () =>
            runInOrgContext(ctx.organizationId, () =>
                prisma.messagingTopup.findFirst({
                    where: { id: topupId, organizationId: ctx.organizationId },
                }),
            );
        const topup = await find();
        if (!topup) throw new NotFoundException("No such top-up.");
        if (topup.status !== "PENDING") return view(topup);
        const statuses = this.providers.get(topup.provider).statuses;
        if (
            !statuses ||
            !this.tries.take(`org:${ctx.organizationId}`, now.getTime())
        ) {
            return view(topup);
        }
        try {
            const said = await statuses.checkoutStatus(
                topup.providerOrderId,
                true,
            );
            if (said.phase === "other") return view(topup);
            await this.webhooks.reconcileTopup(
                topup.id,
                {
                    type: `confirm.${said.phase}`,
                    providerEventId: `confirm:${topup.providerOrderId}:${said.phase}`,
                    providerSubscriptionId: topup.providerOrderId,
                    status: said.status,
                    phase: said.phase,
                    eventAt: null,
                    providerPaymentId: said.providerPaymentId ?? null,
                    providerCustomerId: said.providerCustomerId ?? null,
                },
                now,
            );
        } catch (error) {
            this.logger.warn(
                `messaging_topup_confirm_failed topup=${topup.id}: ${error instanceof Error ? error.name : "unknown"}`,
            );
            return view(topup);
        }
        return view((await find()) ?? topup);
    }
}

function view(t: MessagingTopup): TopupView {
    return {
        id: t.id,
        packId: t.packId,
        amountPaise: t.amountPaise,
        status: t.status,
        createdAt: t.createdAt,
        paidAt: t.paidAt,
    };
}
