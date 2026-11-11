import type { OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import { WebhookDeliverHandler } from "./deliver.handler";
import { WEBHOOK_DELIVER_TYPE } from "./emitter";
import { WebhookEndpointsController } from "./endpoints.controller";
import { WebhookEndpointsService } from "./endpoints.service";

/**
 * Outbound webhooks (plan 2026-11-10-001, U13): the workspace's endpoint
 * routes and the `webhooks.deliver` job. Producers don't import this
 * module: they call `emitWebhook` on their own transaction.
 */
@Module({
    imports: [
        OrganizationContextModule,
        AuditModule,
        FeatureFlagModule,
        JobsModule,
    ],
    controllers: [WebhookEndpointsController],
    providers: [WebhookEndpointsService, WebhookDeliverHandler],
})
export class OutboundWebhooksModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly handler: WebhookDeliverHandler,
    ) {}

    onModuleInit(): void {
        this.registry.register(WEBHOOK_DELIVER_TYPE, this.handler.handle);
    }
}
