import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { OrganizationContextModule } from "./organization-context.module";
import { OrganizationOnboardingService } from "./organization-onboarding.service";
import { OrganizationSettingsService } from "./organization-settings.service";
import { OrganizationsController } from "./organizations.controller";

/**
 * Organization onboarding and settings (S1-003 / S1-004).
 *
 * The context service and guard now live in {@link OrganizationContextModule}.
 * This module re-exports it, so the twenty-odd modules that import
 * `OrganizationsModule` purely to reach `OrganizationContextService` continue to
 * resolve it with no change on their side.
 *
 * Imports {@link AuditModule} (S1-009) so onboarding can emit audit events. That
 * used to be mutual — AuditModule imported this module back for the context
 * service — and both sides wrapped it in `forwardRef`. With the primitive
 * extracted the dependency runs one way and the `forwardRef` is gone.
 */
@Module({
    imports: [OrganizationContextModule, AuditModule],
    controllers: [OrganizationsController],
    providers: [OrganizationOnboardingService, OrganizationSettingsService],
    exports: [OrganizationContextModule],
})
export class OrganizationsModule {}
