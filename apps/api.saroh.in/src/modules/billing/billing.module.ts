import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { env } from "../../env";
import { AuditModule } from "../audit/audit.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { BillingWebhookController } from "./billing-webhook.controller";
import { BillingWebhookService } from "./billing-webhook.service";
import { BillingController, PlansController } from "./billing.controller";
import { CatalogueAccessService } from "./catalogue-access.service";
import { CheckoutService } from "./checkout.service";
import { EntitlementService } from "./entitlement.service";
import {
    BILLING_MOVES_APPLY_TYPE,
    MovesApplyHandler,
} from "./moves-apply.handler";
import { PlansService } from "./plans.service";
import {
    BILLING_PROVIDER_CANCEL_TYPE,
    ProviderCancelHandler,
} from "./provider-cancel.job";
import {
    PROVIDER_PLAN_SYNC_TYPE,
    ProviderPlanSyncService,
} from "./provider-plan-sync.service";
import { billingProviderFactoryProvider } from "./providers/provider.factory";
import { SubscriptionsService } from "./subscriptions.service";

/** How often a stopped sweep chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Saroh SaaS billing (S7-005).
 *
 * The org-scoped surface ({@link BillingController} / {@link PlansController} +
 * their services) lets an org read the plan catalog, see its subscription, and
 * subscribe / change / cancel behind the standard double-guard
 * ({@link OrganizationsModule} supplies the `OrganizationContextService` that
 * `OrganizationGuard` needs, via forwardRef). The PUBLIC
 * {@link BillingWebhookController} + {@link BillingWebhookService} form the
 * signed, idempotent inbox for Saroh's OWN billing-provider webhooks. The
 * {@link billingProviderFactoryProvider} (real Razorpay/Cashfree platform
 * adapters in prod) backs both via `BILLING_PROVIDER_FACTORY`.
 *
 * {@link EntitlementService} is exported for other modules to call before
 * creating a limited resource (a site/member/etc.); it and
 * `GET …/billing/access` read {@link CatalogueAccessService} (plans catalogue
 * U12), exported for metering (U13).
 *
 * Saroh's own checkout and plan changes (plans catalogue U15) are
 * {@link CheckoutService}; three jobs back them: the billing-provider plan
 * sync a publish queues, the provider cancels a change queues, and the
 * hourly sweep that applies due moves and lapses unpaid checkouts.
 *
 * NOTE: this module is intentionally NOT self-registering — the app owner wires
 * it into `AppModule`.
 */
@Module({
    imports: [AuditModule, JobsModule, forwardRef(() => OrganizationsModule)],
    controllers: [PlansController, BillingController, BillingWebhookController],
    providers: [
        PlansService,
        SubscriptionsService,
        CatalogueAccessService,
        EntitlementService,
        BillingWebhookService,
        CheckoutService,
        ProviderPlanSyncService,
        ProviderCancelHandler,
        MovesApplyHandler,
        billingProviderFactoryProvider,
        OrganizationGuard,
    ],
    exports: [
        CatalogueAccessService,
        EntitlementService,
        SubscriptionsService,
        PlansService,
    ],
})
export class BillingModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly sync: ProviderPlanSyncService,
        private readonly cancel: ProviderCancelHandler,
        private readonly sweep: MovesApplyHandler,
    ) {}

    /**
     * Registers the three jobs and starts the sweep's chain — the renewal
     * job's shape (ADR-007): never under test, where no worker runs, and
     * never throwing, so a database not up yet cannot stop the boot.
     */
    async onModuleInit(): Promise<void> {
        this.registry.register(PROVIDER_PLAN_SYNC_TYPE, this.sync.handle);
        this.registry.register(
            BILLING_PROVIDER_CANCEL_TYPE,
            this.cancel.handle,
        );
        this.registry.register(BILLING_MOVES_APPLY_TYPE, this.sweep.handle);
        if (env.NODE_ENV === "test") return;
        await this.sweep.schedule(new Date());
        this.chainCheck = setInterval(() => {
            void this.sweep.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
