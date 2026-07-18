import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { AuditModule } from "../audit/audit.module";
import { OrganizationContextService } from "./organization-context.service";
import { OrganizationOnboardingService } from "./organization-onboarding.service";
import { OrganizationsController } from "./organizations.controller";

/**
 * Organization authorization layer (S1-003) + onboarding (S1-004). Exports the
 * context service so other modules can resolve an `OrganizationContext`;
 * provides the guard so Nest DI can inject the service into it, and the
 * onboarding service that atomically creates an org with its OWNER.
 *
 * Imports {@link AuditModule} (S1-009) so onboarding can emit audit events.
 * The dependency is bidirectional — AuditModule needs this module's
 * `OrganizationContextService` for its guarded read endpoint — so both sides
 * use `forwardRef` to break the module-resolution cycle.
 */
@Module({
    imports: [forwardRef(() => AuditModule)],
    controllers: [OrganizationsController],
    providers: [
        OrganizationContextService,
        OrganizationOnboardingService,
        OrganizationGuard,
    ],
    exports: [OrganizationContextService],
})
export class OrganizationsModule {}
