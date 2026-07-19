import type { OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CommunicationsModule } from "../communications/communications.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import {
    AUTOMATION_RUN_TYPE,
    AutomationRunHandler,
} from "./automation-run.handler";
import { AutomationsController } from "./automations.controller";
import { AutomationsService } from "./automations.service";

/**
 * Org automations (S6-003).
 *
 * Two halves wired together:
 *  - The WRITE/READ surface: {@link AutomationsController} /
 *    {@link AutomationsService} let an org's owners/admins manage constrained
 *    trigger→action rules, behind the same double-guard as the other org-scoped
 *    modules ({@link OrganizationsModule} supplies the
 *    `OrganizationContextService` that `OrganizationGuard` needs, via forwardRef).
 *  - The CONSUMER: {@link AutomationRunHandler} is registered with the
 *    {@link JobHandlerRegistry} (from {@link JobsModule}) for the `automation.run`
 *    job type on boot, so the durable job worker fires each committed new lead's
 *    rules exactly once per (rule, lead). The handler runs `send.message` actions
 *    through {@link CommunicationsModule}'s service (the same consent-gated send
 *    path as a user), so that module is imported for its exported service.
 */
@Module({
    imports: [
        JobsModule,
        CommunicationsModule,
        forwardRef(() => OrganizationsModule),
    ],
    controllers: [AutomationsController],
    providers: [AutomationsService, AutomationRunHandler, OrganizationGuard],
    exports: [AutomationsService],
})
export class AutomationsModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly handler: AutomationRunHandler,
    ) {}

    /** Wire the automation-run consumer into the job worker at boot. */
    onModuleInit(): void {
        this.registry.register(AUTOMATION_RUN_TYPE, this.handler.handle);
    }
}
