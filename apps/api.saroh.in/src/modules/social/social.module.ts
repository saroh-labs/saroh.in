import type { OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { MediaStorageModule } from "../media/media-storage.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import { LimitsModule } from "../rate-limits/limits.module";
import { SharePostsModule } from "../share-posts/share-posts.module";
import { SocialAccess } from "./access/social-access";
import {
    SocialCallbackController,
    SocialController,
} from "./channels/channels.controller";
import { SocialChannelsService } from "./channels/channels.service";
import {
    SOCIAL_REFRESH_TYPE,
    SocialRefreshHandler,
} from "./channels/social-refresh.handler";
import {
    MetaCallbacksController,
    MetaCallbacksService,
} from "./meta/meta-callbacks.controller";
import { socialMetaProvider } from "./meta/provider";
import { SocialPostsController } from "./posts/posts.controller";
import { SocialPostsService } from "./posts/posts.service";
import {
    SOCIAL_PUBLISH_TYPE,
    SocialPublishHandler,
} from "./publish/social-publish.handler";

/**
 * Saroh Social (plan saroh-social 2026-11-18-001): Saroh posts for the
 * business to its Instagram, Facebook Page and Threads. Its access and
 * Channels (U1, U4), and posts (U5).
 */
@Module({
    imports: [
        OrganizationContextModule,
        FeatureFlagModule,
        JobsModule,
        MediaStorageModule,
        SharePostsModule,
        LimitsModule,
    ],
    controllers: [
        SocialController,
        SocialCallbackController,
        SocialPostsController,
        MetaCallbacksController,
    ],
    providers: [
        socialMetaProvider,
        SocialAccess,
        SocialChannelsService,
        SocialPostsService,
        SocialPublishHandler,
        SocialRefreshHandler,
        MetaCallbacksService,
        OrganizationGuard,
    ],
})
export class SocialModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly publish: SocialPublishHandler,
        private readonly refresh: SocialRefreshHandler,
    ) {}

    onModuleInit(): void {
        // A post going out at its time, and each follow-up (U6).
        this.registry.register(SOCIAL_PUBLISH_TYPE, this.publish.handle);
        // An Instagram or Threads token refreshed before it ends (U7).
        this.registry.register(SOCIAL_REFRESH_TYPE, this.refresh.handle);
    }
}
