import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { env } from "../../env";
import { BillingModule } from "../billing/billing.module";
import { billingProviderFactoryProvider } from "../billing/providers/provider.factory";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import { PricingModule } from "../pricing/pricing.module";
import { MessagingCoreModule } from "./messaging-core.module";
import {
    MessagingController,
    PublicVerificationsController,
} from "./messaging.controller";
import { MESSAGING_SEND_TYPE, MessagingService } from "./messaging.service";
import { Msg91WebhookController } from "./msg91-webhook.controller";
import { TopupService } from "./topup.service";
import { WALLET_SWEEP_TYPE, WalletSweepHandler } from "./wallet-sweep.handler";

/** How often a stopped wallet sweep chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Saroh-sent verification codes and the prepaid balance that pays for them
 * (DEC-191), and Saroh's own sender behind the MessagingProvider port
 * (`MessagingService`, docs/architecture/MESSAGING_MSG91.md).
 */
@Module({
    imports: [
        BillingModule,
        JobsModule,
        OrganizationContextModule,
        PricingModule,
        MessagingCoreModule,
    ],
    controllers: [
        MessagingController,
        PublicVerificationsController,
        Msg91WebhookController,
    ],
    providers: [
        billingProviderFactoryProvider,
        TopupService,
        WalletSweepHandler,
    ],
    exports: [MessagingCoreModule],
})
export class MessagingModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly sweep: WalletSweepHandler,
        private readonly messaging: MessagingService,
    ) {}

    /** The wallet sweep (#1240) registers here; never started under test. */
    async onModuleInit(): Promise<void> {
        this.registry.register(WALLET_SWEEP_TYPE, this.sweep.handle);
        this.registry.register(
            MESSAGING_SEND_TYPE,
            this.messaging.handleSendJob,
        );
        if (env.NODE_ENV === "test") return;
        await this.sweep.ensureScheduled();
        this.chainCheck = setInterval(() => {
            void this.sweep.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
