import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { BillingModule } from "../billing/billing.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { OrganizationsModule } from "../organizations/organizations.module";
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
 */
@Module({
    imports: [
        BillingModule,
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        FeatureFlagModule,
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
        OrganizationGuard,
    ],
    exports: [SitesService],
})
export class SitesModule {}
