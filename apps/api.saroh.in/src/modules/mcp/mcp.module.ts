import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { env } from "../../env";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { AuditModule } from "../audit/audit.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { MediaStorageModule } from "../media/media-storage.module";
import { SitesModule } from "../sites/sites.module";
import { McpActivityService } from "./activity.service";
import {
    AI_CONNECTIONS_SWEEP_TYPE,
    AiConnectionsSweepJob,
} from "./ai-connections-sweep.job";
import { AiConnectionsController } from "./ai-connections.controller";
import { AiConnectionsService } from "./ai-connections.service";
import { McpAuthGuard } from "./mcp-auth.guard";
import { McpController } from "./mcp.controller";
import { OAuthFlowController } from "./oauth-flow.controller";
import { OAuthFlowService } from "./oauth-flow.service";
import { RestorePointService } from "./restore-point.service";
import { McpToolRegistry } from "./tool-registry";
import { CoreTools } from "./tools/core.tools";
import { SiteTools } from "./tools/site.tools";
import { WellKnownController } from "./well-known.controller";
// U12: the catalogue and day-to-day tools call U8's `/v1` handlers.
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { BookingsModule } from "../bookings/bookings.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { ContactsModule } from "../contacts/contacts.module";
import { CustomerAddService } from "../customer-workspace/customer-add.service";
import { OrdersModule } from "../orders/orders.module";
import { InventoryService } from "../products/inventory.service";
import { ProductsModule } from "../products/products.module";
import { VariantsService } from "../products/variants.service";
import { BookingsV1Controller } from "../public-api/bookings.v1.controller";
import { CatalogueV1Controller } from "../public-api/catalogue.v1.controller";
import { CustomersV1Controller } from "../public-api/customers.v1.controller";
import { OrdersV1Controller } from "../public-api/orders.v1.controller";
import { CatalogueTools } from "./tools/catalogue.tools";
import { DayTools } from "./tools/day.tools";

/** How often a stopped sweep chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * MCP (plan 2026-11-10-001, Phase D). U9: AI apps' sign-in (the accounts
 * pages' API, the root discovery documents), the business's AI connections,
 * their daily sweep, and {@link McpAuthGuard}, which `/mcp` (U10) puts on its
 * controller. ApiKeysModule brings the guard's dependencies (and U4's
 * limits). U10: `/mcp` itself and the tool framework; tool providers
 * (`tools/*.tools.ts`) register their tools with `McpToolRegistry` at boot
 * and are listed below.
 */
@Module({
    imports: [
        ApiKeysModule,
        AuditModule,
        JobsModule,
        // U11: the website tools call the sites and media services.
        SitesModule,
        MediaStorageModule,
        // U12: the `/v1` handlers' services, and module availability.
        BookingsModule,
        CapabilitiesModule,
        ContactsModule,
        OrdersModule,
        ProductsModule,
    ],
    controllers: [
        AiConnectionsController,
        McpController,
        OAuthFlowController,
        WellKnownController,
    ],
    providers: [
        AiConnectionsService,
        AiConnectionsSweepJob,
        McpAuthGuard,
        OAuthFlowService,
        McpActivityService,
        McpToolRegistry,
        RestorePointService,
        // Tool providers.
        CoreTools,
        SiteTools,
        CatalogueTools,
        DayTools,
        // U12: U8's handlers as plain providers (their routes stay in
        // PublicApiModule), and what they need.
        CatalogueV1Controller,
        BookingsV1Controller,
        OrdersV1Controller,
        CustomersV1Controller,
        IdempotencyService,
        VariantsService,
        InventoryService,
        CustomerAddService,
    ],
    exports: [McpAuthGuard, AiConnectionsService, ApiKeysModule],
})
export class McpModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly sweep: AiConnectionsSweepJob,
    ) {}

    async onModuleInit(): Promise<void> {
        this.registry.register(AI_CONNECTIONS_SWEEP_TYPE, this.sweep.handle);
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
