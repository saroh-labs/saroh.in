import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ProjectAccessService } from "./project-access.service";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { TeamsController } from "./teams.controller";

/**
 * Projects, Teams & project-level access (S1-010). Imports
 * {@link OrganizationsModule} for `OrganizationContextService` (exported there)
 * and provides {@link OrganizationGuard} so Nest can inject that service into
 * the guard protecting these org-scoped routes.
 */
@Module({
    imports: [OrganizationsModule],
    controllers: [ProjectsController, TeamsController],
    providers: [ProjectsService, ProjectAccessService, OrganizationGuard],
    exports: [ProjectsService, ProjectAccessService],
})
export class ProjectsModule {}
