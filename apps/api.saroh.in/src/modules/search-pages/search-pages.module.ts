import type { OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { AdminAuditService } from "../admin/admin-audit.service";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { PublicSearchPagesController } from "./public-search-pages.controller";
import {
    SEARCH_PAGES_DEPLOY_TYPE,
    SearchPagesDeployHandler,
} from "./search-pages-deploy.job";
import { SearchPagesService } from "./search-pages.service";

/**
 * Search pages' publish records (DEC-193): the public list saroh.in builds
 * from, and the web deploy an action queues. The console's controller
 * (`search-pages.controller.ts`) is registered by the admin module, so the
 * control plane's guards and permission contract cover it.
 */
@Module({
    imports: [JobsModule],
    controllers: [PublicSearchPagesController],
    providers: [
        SearchPagesService,
        SearchPagesDeployHandler,
        AdminAuditService,
    ],
    exports: [SearchPagesService],
})
export class SearchPagesModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly deploy: SearchPagesDeployHandler,
    ) {}

    onModuleInit(): void {
        this.registry.register(SEARCH_PAGES_DEPLOY_TYPE, this.deploy.handle);
    }
}
