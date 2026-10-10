import type { OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { AnalyticsCoreModule } from "../analytics/analytics-core.module";
import { BillingModule } from "../billing/billing.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { GoLiveHandler, SITE_GO_LIVE_TYPE } from "./go-live.handler";
import { SITE_PAGES_REVALIDATE_TYPE } from "./page-cache-revalidate";
import { PageCacheRevalidateHandler } from "./page-cache.job";
import { PublicFooterService } from "./public-footer.service";
import { PublicHeadService } from "./public-head.service";
import { PublicSitesController } from "./public-sites.controller";
import { PublicVisitService } from "./public-visit.service";
import { SitePreviewLinksService } from "./site-preview-links.service";
import { SiteTrackingController } from "./site-tracking.controller";
import { SiteTrackingService } from "./site-tracking.service";
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
 * scheduled go-live, and `site.pages.revalidate` (#863): telling the merchant
 * sites' Worker which kept pages changed. Both registered with the
 * {@link JobHandlerRegistry} on boot.
 */
@Module({
    imports: [
        // The activation ledger: the first publish (DEC-123).
        AnalyticsCoreModule,
        BillingModule,
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        FeatureFlagModule,
        JobsModule,
    ],
    controllers: [
        SitesController,
        TestReleasesController,
        SiteTrackingController,
        PublicSitesController,
    ],
    providers: [
        SitesService,
        SitePreviewLinksService,
        SiteTrackingService,
        TestReleasesService,
        PublicVisitService,
        PublicFooterService,
        PublicHeadService,
        GoLiveHandler,
        PageCacheRevalidateHandler,
        OrganizationGuard,
    ],
    exports: [SitesService],
})
export class SitesModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly goLive: GoLiveHandler,
        private readonly pageCache: PageCacheRevalidateHandler,
    ) {}

    /** Wire the scheduled go-live and the page cache into the job worker. */
    onModuleInit(): void {
        this.registry.register(SITE_GO_LIVE_TYPE, this.goLive.handle);
        this.registry.register(
            SITE_PAGES_REVALIDATE_TYPE,
            this.pageCache.handle,
        );
    }
}
