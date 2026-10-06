import type { OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { CatalogueService } from "./catalogue.service";
import { ImpactService } from "./impact.service";
import { MoveNoticeHandler } from "./move-notice.handler";
import { PRICING_MOVE_NOTICE_TYPE } from "./moves.service";
import { PublicPricingController } from "./public-pricing.controller";
import {
    PRICING_REVALIDATE_TYPE,
    RevalidateSiteHandler,
} from "./revalidate-site.job";

/**
 * Saroh's own plans catalogue (plans catalogue U3, U4): the public price
 * list here, the services the admin module's `AdminPricingController` uses,
 * and the two jobs a publish queues — saroh.in's revalidation and the
 * seven-day notice before a business's plan moves. The admin controller and
 * the write services are registered by the admin module, so they run
 * behind the control plane's guards and audit through its ledger.
 */
@Module({
    imports: [JobsModule],
    controllers: [PublicPricingController],
    providers: [
        CatalogueService,
        ImpactService,
        RevalidateSiteHandler,
        MoveNoticeHandler,
    ],
    exports: [CatalogueService, ImpactService],
})
export class PricingModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly revalidate: RevalidateSiteHandler,
        private readonly moveNotice: MoveNoticeHandler,
    ) {}

    onModuleInit(): void {
        this.registry.register(PRICING_REVALIDATE_TYPE, this.revalidate.handle);
        this.registry.register(
            PRICING_MOVE_NOTICE_TYPE,
            this.moveNotice.handle,
        );
    }
}
