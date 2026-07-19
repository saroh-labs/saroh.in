import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "@thallesp/nestjs-better-auth";

import { auth } from "./common/auth/auth";
import { AuditModule } from "./modules/audit/audit.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { CommunicationsModule } from "./modules/communications/communications.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { ContentModule } from "./modules/content/content.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { DomainsModule } from "./modules/domains/domains.module";
import { EnquiryModule } from "./modules/enquiry/enquiry.module";
import { FeatureFlagModule } from "./modules/feature-flags/feature-flags.module";
import { FormsModule } from "./modules/forms/forms.module";
import { HealthModule } from "./modules/health/health.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { MediaModule } from "./modules/media/media.module";
import { MembersModule } from "./modules/members/members.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { PipelinesModule } from "./modules/pipelines/pipelines.module";
import { ProductsModule } from "./modules/products/products.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { SelfTestModule } from "./modules/self-test/self-test.module";
import { SitesModule } from "./modules/sites/sites.module";
import { StoresModule } from "./modules/stores/stores.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";

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
            // rawBody: true attaches the raw request Buffer to `req.rawBody` (via
            // the JSON parser's `verify` hook) for every non-auth route. The
            // public webhook endpoint (S5-003) needs those exact bytes to
            // HMAC-verify a provider signature — the re-serialized parsed JSON
            // would not byte-match and would break verification.
            bodyParser: {
                json: {},
                urlencoded: { extended: true },
                rawBody: true,
            },
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
        JobsModule,
        FormsModule,
        EnquiryModule,
        ContactsModule,
        PipelinesModule,
        LeadsModule,
        NotificationsModule,
        BookingsModule,
        PaymentsModule,
        WebhooksModule,
        CommunicationsModule,
        SelfTestModule,
    ],
})
export class AppModule {}
