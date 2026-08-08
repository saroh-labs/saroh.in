import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationContextService } from "./organization-context.service";

/**
 * The organization-context primitive, on its own.
 *
 * Resolving "who is acting, in which Organization, with what role" is not an
 * Organizations *feature* — it is the thing every other module's guard needs
 * before it can do anything. Twenty-odd modules were importing the whole
 * `OrganizationsModule` to reach it, and `AuditModule` importing it while
 * `OrganizationsModule` imported `AuditModule` back produced a genuine module
 * cycle that both sides papered over with `forwardRef`.
 *
 * Extracting the service (and the guard that depends on it) into a module that
 * imports nothing breaks the cycle at its cause rather than tolerating it.
 * `OrganizationsModule` re-exports this module, so every existing consumer that
 * imports `OrganizationsModule` for `OrganizationContextService` keeps working
 * unchanged; new modules should import this one directly.
 */
@Module({
    providers: [OrganizationContextService, OrganizationGuard],
    exports: [OrganizationContextService, OrganizationGuard],
})
export class OrganizationContextModule {}
