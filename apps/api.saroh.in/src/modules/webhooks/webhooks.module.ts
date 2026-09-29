import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { env } from "../../env";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { PaymentsModule } from "../payments/payments.module";
import { providerFactoryProvider } from "../payments/providers/provider.factory";
import { CheckoutReturnController } from "./checkout-return.controller";
import { PaymentLookupService } from "./payment-lookup.service";
import {
    CONFIRM_PENDING_PAYMENTS_TYPE,
    PendingPaymentsHandler,
} from "./pending-payments.handler";
import { webhookProviderFactoryProvider } from "./providers/webhook-provider.factory";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";

/** How often a stopped sweep chain is looked for and restarted. */
const CHAIN_CHECK_MS = 15 * 60 * 1000;

/**
 * Signed webhook inbox + reconciliation (S5-003).
 *
 * PUBLIC and org-agnostic at the HTTP layer (no session, no guards) — trust is
 * established by HMAC-verifying the raw body against the org's stored webhook
 * secret. Imports {@link PaymentsModule} for {@link PaymentsService.getWebhookSecret}
 * and wires the {@link webhookProviderFactoryProvider} (real Razorpay/Cashfree
 * verifiers in prod) under the `WEBHOOK_PROVIDER_FACTORY` token.
 *
 * And the webhook's backup (P1): the checkout's signed return
 * ({@link CheckoutReturnController}), the pending payment sweep
 * ({@link PendingPaymentsHandler}) and the look-up both use
 * ({@link PaymentLookupService}), which asks the provider through the
 * merchant adapters ({@link providerFactoryProvider}) and settles through
 * the webhook's own reconciliation.
 */
@Module({
    imports: [PaymentsModule, JobsModule],
    controllers: [WebhooksController, CheckoutReturnController],
    providers: [
        WebhooksService,
        webhookProviderFactoryProvider,
        providerFactoryProvider,
        PaymentLookupService,
        PendingPaymentsHandler,
    ],
    // Exported for the admin console, which replays failed deliveries, and
    // for the hold release, which asks about a hold's payment first (P1).
    exports: [WebhooksService, PaymentLookupService],
})
export class WebhooksModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly pending: PendingPaymentsHandler,
    ) {}

    /**
     * Registers the pending payment sweep (P1) and starts its chain — the
     * renewal job's shape (ADR-007): never under test, where no worker
     * runs, and never throwing, so a database not up yet cannot stop the
     * boot.
     */
    async onModuleInit(): Promise<void> {
        this.registry.register(
            CONFIRM_PENDING_PAYMENTS_TYPE,
            this.pending.handle,
        );
        if (env.NODE_ENV === "test") return;
        await this.pending.schedule(new Date());
        this.chainCheck = setInterval(() => {
            void this.pending.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
