import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

/**
 * Organization audit-event stream (S1-009). Exports {@link AuditService} so
 * other modules (onboarding, membership mutations) can emit events; imports
 * {@link OrganizationsModule} for `OrganizationContextService` (exported there)
 * and provides {@link OrganizationGuard} so Nest can inject that service into
 * the guard protecting the read endpoint.
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule)],
    controllers: [AuditController],
    providers: [AuditService, OrganizationGuard],
    exports: [AuditService],
})
export class AuditModule {}
