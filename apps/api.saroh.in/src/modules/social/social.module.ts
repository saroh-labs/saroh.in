import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import { SocialAccess } from "./access/social-access";
import {
    SocialCallbackController,
    SocialController,
} from "./channels/channels.controller";
import { SocialChannelsService } from "./channels/channels.service";
import { socialMetaProvider } from "./meta/provider";

/**
 * Saroh Social (plan saroh-social 2026-11-18-001): Saroh posts for the
 * business to its Instagram, Facebook Page and Threads. Its access and
 * Channels (U1, U4).
 */
@Module({
    imports: [OrganizationContextModule, FeatureFlagModule],
    controllers: [SocialController, SocialCallbackController],
    providers: [
        socialMetaProvider,
        SocialAccess,
        SocialChannelsService,
        OrganizationGuard,
    ],
})
export class SocialModule {}
