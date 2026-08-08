import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { SavedViewsController } from "./saved-views.controller";
import { SavedViewsService } from "./saved-views.service";

/** Saved list views (#124). */
@Module({
    imports: [OrganizationsModule],
    controllers: [SavedViewsController],
    providers: [SavedViewsService, OrganizationGuard],
})
export class SavedViewsModule {}
