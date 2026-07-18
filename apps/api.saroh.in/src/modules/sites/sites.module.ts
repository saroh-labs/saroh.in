import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PublicSitesController } from "./public-sites.controller";
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
    imports: [forwardRef(() => OrganizationsModule)],
    controllers: [SitesController, PublicSitesController],
    providers: [SitesService, OrganizationGuard],
    exports: [SitesService],
})
export class SitesModule {}
