import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { BillingWebhookController } from "./billing-webhook.controller";
import { BillingWebhookService } from "./billing-webhook.service";
import { BillingController, PlansController } from "./billing.controller";
import { EntitlementService } from "./entitlement.service";
import { PlansService } from "./plans.service";
import { billingProviderFactoryProvider } from "./providers/provider.factory";
import { SubscriptionsService } from "./subscriptions.service";

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
 * creating a limited resource (a site/member/etc.).
 *
 * NOTE: this module is intentionally NOT self-registering — the app owner wires
 * it into `AppModule`.
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule)],
    controllers: [PlansController, BillingController, BillingWebhookController],
    providers: [
        PlansService,
        SubscriptionsService,
        EntitlementService,
        BillingWebhookService,
        billingProviderFactoryProvider,
        OrganizationGuard,
    ],
    exports: [EntitlementService, SubscriptionsService, PlansService],
})
export class BillingModule {}
