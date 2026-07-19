import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { FormsController } from "./forms.controller";
import { FormsService } from "./forms.service";

/**
 * Org-owned enquiry Form management (S3-002). Imports
 * {@link OrganizationsModule} (via forwardRef) for the
 * `OrganizationContextService` that `OrganizationGuard` needs. Exports
 * {@link FormsService} for reuse (e.g. future CRM tickets).
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule)],
    controllers: [FormsController],
    providers: [FormsService, OrganizationGuard],
    exports: [FormsService],
})
export class FormsModule {}
