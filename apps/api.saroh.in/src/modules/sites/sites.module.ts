import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { BillingModule } from "../billing/billing.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PublicSitesController } from "./public-sites.controller";
import { SitePreviewLinksService } from "./site-preview-links.service";
import { SitesController } from "./sites.controller";
import { SitesService } from "./sites.service";

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
    ],
    controllers: [SitesController, PublicSitesController],
    providers: [SitesService, SitePreviewLinksService, OrganizationGuard],
    exports: [SitesService],
})
export class SitesModule {}
