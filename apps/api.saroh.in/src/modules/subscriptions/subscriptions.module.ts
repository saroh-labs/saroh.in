import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { env } from "../../env";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PaymentsModule } from "../payments/payments.module";
import { AccountPlanController } from "../site-accounts/account-plan.controller";
import {
    AccountPlanService,
    AUTOPAY_CHARGE_PENDING,
    NO_AUTOPAY_YET,
} from "../site-accounts/account-plan.service";
import { SiteAccountsModule } from "../site-accounts/site-accounts.module";
import { AccountAutopayController } from "./account-autopay.controller";
import { AccountAutopayService } from "./account-autopay.service";
import { AccountPlanJoinController } from "./account-plan-join.controller";
import { PublicPlanJoinService } from "./public-plan-join.service";
import { PublicPlansController } from "./public-plans.controller";
import { PublicPlansService } from "./public-plans.service";
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
 *
 * A member's own plan, from their account on the business's site (round-2
 * A8), is served here too: {@link AccountPlanController}, behind the
 * customer's session (`SiteAccountsModule`), as bookings serve a signed-in
 * customer's booking.
 */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        InvoicesModule,
        JobsModule,
        SiteAccountsModule,
        // Joining a plan online (G20): the invoice payment path.
        PaymentsModule,
    ],
    controllers: [
        SubscriptionPlansController,
        SubscriptionsController,
        PublicPlansController,
        AccountPlanController,
        AccountPlanJoinController,
        AccountAutopayController,
    ],
    providers: [
        SubscriptionsService,
        PublicPlansService,
        SubscriptionRenewHandler,
        OrganizationGuard,
        AccountPlanService,
        PublicPlanJoinService,
        // The customer turns autopay on from their account (D12).
        AccountAutopayService,
        // No autopay charge is ever under way until D13 provides the check.
        { provide: AUTOPAY_CHARGE_PENDING, useValue: NO_AUTOPAY_YET },
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
