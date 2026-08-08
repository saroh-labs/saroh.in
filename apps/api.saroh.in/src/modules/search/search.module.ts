import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

/**
 * Cross-entity quick search for the command palette. Imports
 * {@link OrganizationsModule} (via forwardRef) for the
 * `OrganizationContextService` that `OrganizationGuard` needs, and provides the
 * guard so the controller's `@UseGuards` can resolve it.
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule)],
    controllers: [SearchController],
    providers: [SearchService, OrganizationGuard],
    exports: [SearchService],
})
export class SearchModule {}
