import type { OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { AnalyticsCoreModule } from "../analytics/analytics-core.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { DiscountsModule } from "../discounts/discounts.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { PaymentsModule } from "../payments/payments.module";
import { SiteAccountsModule } from "../site-accounts/site-accounts.module";
import { StoresModule } from "../stores/stores.module";
import {
    CLOSE_ABANDONED_CHECKOUT_TYPE,
    CloseAbandonedCheckoutHandler,
} from "./close-abandoned-checkout.handler";
import { OrderCancelService } from "./order-cancel.service";
import { OrderFulfilmentChangeService } from "./order-fulfilment-change.service";
import { OrderKitchenService } from "./order-kitchen.service";
import { OrderPayLinkService } from "./order-pay-link.service";
import {
    ORDER_STAGE_BATCH_COMMIT_TYPE,
    OrderStageBatchCommitHandler,
} from "./order-stage-batch.handler";
import { OrderStageBatchService } from "./order-stage-batch.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrganizationOrdersController } from "./organization-orders.controller";
import { PublicCheckoutController } from "./public-checkout.controller";
import { PublicCheckoutService } from "./public-checkout.service";

@Module({
    imports: [
        StoresModule,
        CapabilitiesModule,
        AnalyticsCoreModule,
        DiscountsModule,
        // The kitchen flow takes or returns the difference when an order is
        // edited (U6); the site's checkout makes its intent (G13).
        PaymentsModule,
        // The customer session guard for the site's checkout (G13).
        SiteAccountsModule,
        // Closing abandoned checkouts (G13).
        JobsModule,
    ],
    controllers: [
        OrdersController,
        OrganizationOrdersController,
        PublicCheckoutController,
    ],
    providers: [
        OrdersService,
        OrderKitchenService,
        OrderPayLinkService,
        OrderFulfilmentChangeService,
        OrderCancelService,
        PublicCheckoutService,
        CloseAbandonedCheckoutHandler,
        OrderStageBatchService,
        OrderStageBatchCommitHandler,
    ],
    exports: [OrdersService],
})
export class OrdersModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly closeAbandoned: CloseAbandonedCheckoutHandler,
        private readonly stageBatches: OrderStageBatchCommitHandler,
    ) {}

    /**
     * The job each checkout start writes, a day ahead (G13), and the one a
     * held bulk move writes, ten seconds ahead (B6).
     */
    onModuleInit(): void {
        this.registry.register(
            CLOSE_ABANDONED_CHECKOUT_TYPE,
            this.closeAbandoned.handle,
        );
        this.registry.register(
            ORDER_STAGE_BATCH_COMMIT_TYPE,
            this.stageBatches.handle,
        );
    }
}
