import type { OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PostCategoriesController } from "./post-categories.controller";
import { PostCategoriesService } from "./post-categories.service";
import { POST_GO_LIVE_TYPE, PostGoLiveHandler } from "./post-go-live.handler";
import { PostRevisionsService } from "./post-revisions.service";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";

/**
 * A site's writing (ADR-004, #209).
 *
 * Imports {@link OrganizationsModule} for the `OrganizationContextService` that
 * `OrganizationGuard` needs. It no longer depends on `StoresModule`: a post
 * belongs to the site it is published on, so a business with a website and no
 * shop can write.
 */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        JobsModule,
    ],
    controllers: [PostsController, PostCategoriesController],
    providers: [
        PostsService,
        PostCategoriesService,
        PostRevisionsService,
        PostGoLiveHandler,
        OrganizationGuard,
    ],
    exports: [PostsService, PostCategoriesService],
})
export class ContentModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly goLive: PostGoLiveHandler,
    ) {}

    /** Publish post › Later (U17a). */
    onModuleInit(): void {
        this.registry.register(POST_GO_LIVE_TYPE, this.goLive.handle);
    }
}
