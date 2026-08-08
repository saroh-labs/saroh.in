import { Module } from "@nestjs/common";

import { OrganizationContextModule } from "../organizations/organization-context.module";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

/**
 * Organization audit-event stream (S1-009). Exports {@link AuditService} so
 * other modules (onboarding, membership mutations) can emit events.
 *
 * Imports {@link OrganizationContextModule} for the `OrganizationGuard` that
 * protects the read endpoint. This used to import `OrganizationsModule`, which
 * imports this module back — a real cycle, held together by `forwardRef` on
 * both sides. Depending on the context primitive directly removes it.
 */
@Module({
    imports: [OrganizationContextModule],
    controllers: [AuditController],
    providers: [AuditService],
    exports: [AuditService],
})
export class AuditModule {}
