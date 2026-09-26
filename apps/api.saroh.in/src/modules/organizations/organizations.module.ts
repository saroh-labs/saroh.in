import { Module } from "@nestjs/common";

import { AnalyticsCoreModule } from "../analytics/analytics-core.module";
import { AuditModule } from "../audit/audit.module";
import { MediaModule } from "../media/media.module";
import { OrganizationContextModule } from "./organization-context.module";
import { OrganizationMembersController } from "./organization-members.controller";
import { OrganizationMembersService } from "./organization-members.service";
import { OrganizationOnboardingService } from "./organization-onboarding.service";
import { OrganizationRolesController } from "./organization-roles.controller";
import { OrganizationRolesService } from "./organization-roles.service";
import { OrganizationSettingsService } from "./organization-settings.service";
import { OrganizationsController } from "./organizations.controller";
import { PublicInvitationsController } from "./public-invitations.controller";

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
    imports: [
        OrganizationContextModule,
        AuditModule,
        AnalyticsCoreModule,
        // The business logo is a library object (`MediaService.readyObject`).
        MediaModule,
    ],
    controllers: [
        OrganizationsController,
        OrganizationMembersController,
        PublicInvitationsController,
        OrganizationRolesController,
    ],
    providers: [
        OrganizationOnboardingService,
        OrganizationSettingsService,
        OrganizationMembersService,
        OrganizationRolesService,
    ],
    // The members service is exported for the admin console, whose operators
    // change a person's place in a business under the business's own rules.
    exports: [OrganizationContextModule, OrganizationMembersService],
})
export class OrganizationsModule {}
