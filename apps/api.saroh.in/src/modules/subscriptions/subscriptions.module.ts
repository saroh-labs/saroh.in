import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { env } from "../../env";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import {
    SUBSCRIPTION_RENEW_TYPE,
    SubscriptionRenewHandler,
} from "./subscription-renew.handler";
import {
    SubscriptionPlansController,
    SubscriptionsController,
} from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

/** How often the renewal chain is checked for a stop. */
const CHAIN_CHECK_MS = 15 * 60 * 1000;

/**
 * Plans, the people on them, and the job that invoices each period
 * (ADR-007). On start-up it registers the renewal handler and makes sure a
 * run is waiting — the job reschedules itself from then on, and a timer
 * restarts the chain if it ever stops.
 */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        InvoicesModule,
        JobsModule,
    ],
    controllers: [SubscriptionPlansController, SubscriptionsController],
    providers: [
        SubscriptionsService,
        SubscriptionRenewHandler,
        OrganizationGuard,
    ],
    exports: [SubscriptionsService],
})
export class SubscriptionsModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly renew: SubscriptionRenewHandler,
    ) {}

    async onModuleInit(): Promise<void> {
        this.registry.register(SUBSCRIPTION_RENEW_TYPE, this.renew.handle);
        // No worker runs under test, so nothing would ever claim the run.
        if (env.NODE_ENV === "test") return;
        // Never throws: a database that is not up yet must not stop the API
        // booting. The next start, or the next run, schedules it.
        await this.renew.schedule(new Date());
        this.chainCheck = setInterval(() => {
            void this.renew.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
