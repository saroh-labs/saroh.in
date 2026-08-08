import { Module } from "@nestjs/common";

import { PaymentsModule } from "../payments/payments.module";
import { webhookProviderFactoryProvider } from "./providers/webhook-provider.factory";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";

/**
 * Signed webhook inbox + reconciliation (S5-003).
 *
 * PUBLIC and org-agnostic at the HTTP layer (no session, no guards) — trust is
 * established by HMAC-verifying the raw body against the org's stored webhook
 * secret. Imports {@link PaymentsModule} for {@link PaymentsService.getWebhookSecret}
 * and wires the {@link webhookProviderFactoryProvider} (real Razorpay/Cashfree
 * verifiers in prod) under the `WEBHOOK_PROVIDER_FACTORY` token.
 */
@Module({
    imports: [PaymentsModule],
    controllers: [WebhooksController],
    providers: [WebhooksService, webhookProviderFactoryProvider],
})
export class WebhooksModule {}
