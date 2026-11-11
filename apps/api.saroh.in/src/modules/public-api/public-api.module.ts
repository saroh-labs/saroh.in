import { Module } from "@nestjs/common";

import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { BookingsModule } from "../bookings/bookings.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { ContactsModule } from "../contacts/contacts.module";
import { CustomerAddService } from "../customer-workspace/customer-add.service";
import { EnquiryModule } from "../enquiry/enquiry.module";
import { OrdersModule } from "../orders/orders.module";
import { PaymentsModule } from "../payments/payments.module";
import { InventoryService } from "../products/inventory.service";
import { ProductsModule } from "../products/products.module";
import { VariantsService } from "../products/variants.service";
import { SitesModule } from "../sites/sites.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { BookingsV1Controller } from "./bookings.v1.controller";
import { CatalogueV1Controller } from "./catalogue.v1.controller";
import { CustomersV1Controller } from "./customers.v1.controller";
import { EnquiriesV1Controller } from "./enquiries.v1.controller";
import { OrdersV1Controller } from "./orders.v1.controller";
import { StorefrontTokenGuard } from "./storefront-token.guard";
import { StorefrontTokensService } from "./storefront-tokens.service";
import {
    StorefrontController,
    StorefrontTokensController,
    StorefrontWriteController,
} from "./storefront.controller";
import { StorefrontService } from "./storefront.service";

/**
 * The public REST API (plan 2026-11-10-001): `/v1` with a secret key and
 * `/v1/storefront` with a publishable key or a storefront token. Its
 * controllers call the same services as the workspace and `/public/*`.
 */
@Module({
    imports: [
        ApiKeysModule,
        BookingsModule,
        CapabilitiesModule,
        ContactsModule,
        EnquiryModule,
        OrdersModule,
        PaymentsModule,
        ProductsModule,
        SitesModule,
        SubscriptionsModule,
    ],
    controllers: [
        // Storefront writes before the reads: `write` is never a key.
        StorefrontWriteController,
        StorefrontController,
        StorefrontTokensController,
        // `/v1` with a secret key (U8).
        CatalogueV1Controller,
        BookingsV1Controller,
        OrdersV1Controller,
        CustomersV1Controller,
        EnquiriesV1Controller,
    ],
    providers: [
        StorefrontService,
        StorefrontTokensService,
        StorefrontTokenGuard,
        IdempotencyService,
        VariantsService,
        InventoryService,
        CustomerAddService,
    ],
})
export class PublicApiModule {}
