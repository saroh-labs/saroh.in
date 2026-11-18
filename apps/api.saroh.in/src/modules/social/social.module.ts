import type { OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { MediaStorageModule } from "../media/media-storage.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import { SharePostsModule } from "../share-posts/share-posts.module";
import { SocialAccess } from "./access/social-access";
import {
    SocialCallbackController,
    SocialController,
} from "./channels/channels.controller";
import { SocialChannelsService } from "./channels/channels.service";
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
    ],
    controllers: [
        SocialController,
        SocialCallbackController,
        SocialPostsController,
    ],
    providers: [
        socialMetaProvider,
        SocialAccess,
        SocialChannelsService,
        SocialPostsService,
        SocialPublishHandler,
        OrganizationGuard,
    ],
})
export class SocialModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly publish: SocialPublishHandler,
    ) {}

    onModuleInit(): void {
        // A post going out at its time, and each follow-up (U6).
        this.registry.register(SOCIAL_PUBLISH_TYPE, this.publish.handle);
    }
}
