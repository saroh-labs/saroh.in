import { Module } from "@nestjs/common";

import { AnalyticsCoreModule } from "../analytics/analytics-core.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { DiscountsModule } from "../discounts/discounts.module";
import { PaymentsModule } from "../payments/payments.module";
import { StoresModule } from "../stores/stores.module";
import { OrderKitchenService } from "./order-kitchen.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrganizationOrdersController } from "./organization-orders.controller";

@Module({
    imports: [
        StoresModule,
        CapabilitiesModule,
        AnalyticsCoreModule,
        DiscountsModule,
        // The kitchen flow takes or returns the difference when an order is
        // edited (U6).
        PaymentsModule,
    ],
    controllers: [OrdersController, OrganizationOrdersController],
    providers: [OrdersService, OrderKitchenService],
    exports: [OrdersService],
})
export class OrdersModule {}
