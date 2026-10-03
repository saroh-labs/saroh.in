import type { OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { BillingModule } from "../billing/billing.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { GoLiveHandler, SITE_GO_LIVE_TYPE } from "./go-live.handler";
import { PublicSitesController } from "./public-sites.controller";
import { PublicVisitService } from "./public-visit.service";
import { SitePreviewLinksService } from "./site-preview-links.service";
import { SitesController } from "./sites.controller";
import { SitesService } from "./sites.service";
import { TestReleasesController } from "./test-releases.controller";
import { TestReleasesService } from "./test-releases.service";

/**
 * Org-owned publishing sites (S2-003). Imports {@link OrganizationsModule} for
 * the `OrganizationContextService` that `OrganizationGuard` needs, and provides
 * {@link SitesService}, which instantiates a template (from `@saroh/templates`)
 * and persists a whole draft site (Site + Pages + DRAFT PageVersions +
 * Sections) atomically.
 *
 * It also consumes `site.go_live` (DEC-071, T10): a test release's
 * scheduled go-live, registered with the {@link JobHandlerRegistry} on boot.
 */
@Module({
    imports: [
        BillingModule,
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        FeatureFlagModule,
        JobsModule,
    ],
    controllers: [
        SitesController,
        TestReleasesController,
        PublicSitesController,
    ],
    providers: [
        SitesService,
        SitePreviewLinksService,
        TestReleasesService,
        PublicVisitService,
        GoLiveHandler,
        OrganizationGuard,
    ],
    exports: [SitesService],
})
export class SitesModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly goLive: GoLiveHandler,
    ) {}

    /** Wire the scheduled go-live into the job worker at boot. */
    onModuleInit(): void {
        this.registry.register(SITE_GO_LIVE_TYPE, this.goLive.handle);
    }
}
