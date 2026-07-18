import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationContextService } from "./organization-context.service";
import { OrganizationOnboardingService } from "./organization-onboarding.service";
import { OrganizationsController } from "./organizations.controller";

/**
 * Organization authorization layer (S1-003) + onboarding (S1-004). Exports the
 * context service so other modules can resolve an `OrganizationContext`;
 * provides the guard so Nest DI can inject the service into it, and the
 * onboarding service that atomically creates an org with its OWNER.
 */
@Module({
    controllers: [OrganizationsController],
    providers: [
        OrganizationContextService,
        OrganizationOnboardingService,
        OrganizationGuard,
    ],
    exports: [OrganizationContextService],
})
export class OrganizationsModule {}
