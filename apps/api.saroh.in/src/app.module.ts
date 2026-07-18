import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "@thallesp/nestjs-better-auth";

import { auth } from "./common/auth/auth";
import { AuditModule } from "./modules/audit/audit.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { ContentModule } from "./modules/content/content.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { DomainsModule } from "./modules/domains/domains.module";
import { FeatureFlagModule } from "./modules/feature-flags/feature-flags.module";
import { HealthModule } from "./modules/health/health.module";
import { MediaModule } from "./modules/media/media.module";
import { MembersModule } from "./modules/members/members.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { ProductsModule } from "./modules/products/products.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { SitesModule } from "./modules/sites/sites.module";
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
        FeatureFlagModule,
        OrganizationsModule,
        ProjectsModule,
        AuditModule,
        StoresModule,
        MembersModule,
        ProductsModule,
        CategoriesModule,
        CustomersModule,
        OrdersModule,
        ContentModule,
        MediaModule,
        SitesModule,
        DomainsModule,
    ],
})
export class AppModule {}
