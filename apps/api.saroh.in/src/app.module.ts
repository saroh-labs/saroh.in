import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "@thallesp/nestjs-better-auth";

import { auth } from "./common/auth/auth";
import { CategoriesModule } from "./modules/categories/categories.module";
import { ContentModule } from "./modules/content/content.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { HealthModule } from "./modules/health/health.module";
import { MembersModule } from "./modules/members/members.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { ProductsModule } from "./modules/products/products.module";
import { StoresModule } from "./modules/stores/stores.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: [".env.local", ".env"],
        }),
        // Mounts Better Auth at /api/auth/*. Body parsing was disabled in
        // main.ts (Better Auth needs the raw body) and re-added here for the
        // non-auth routes. We guard business routes explicitly with
        // BetterAuthGuard, so no global auth guard.
        AuthModule.forRoot({
            auth,
            disableGlobalAuthGuard: true,
            bodyParser: { json: {}, urlencoded: { extended: true } },
        }),
        HealthModule,
        OrganizationsModule,
        StoresModule,
        MembersModule,
        ProductsModule,
        CategoriesModule,
        CustomersModule,
        OrdersModule,
        ContentModule,
    ],
})
export class AppModule {}
