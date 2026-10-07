import type { OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { AuditModule } from "../audit/audit.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import {
    ENQUIRY_NOTIFY_TYPE,
    EnquiryNotifyHandler,
} from "./enquiry-notify.handler";
import { NotificationPreferencesController } from "./notification-preferences.controller";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { TEAM_ALERT_TYPE, TeamAlertHandler } from "./team-alert.handler";

/**
 * New-enquiry notifications (S3-006), and the team's alerts (round-2 F14).
 *
 * Wired together:
 *  - The CONSUMERS: {@link EnquiryNotifyHandler} for `enquiry.notify`, and
 *    {@link TeamAlertHandler} for `team.alert` (a new order, a booking the
 *    customer made, a failed payment, someone joining), registered with the
 *    {@link JobHandlerRegistry} on boot.
 *  - The READ surface: {@link NotificationsController} /
 *    {@link NotificationsService} let an org's owners/admins list and
 *    acknowledge their inbox, and {@link NotificationPreferencesController}
 *    lets each person choose what reaches them — behind the same
 *    double-guard as the other org-scoped modules
 *    ({@link OrganizationsModule} supplies the `OrganizationContextService`
 *    that `OrganizationGuard` needs, via forwardRef).
 *
 * Both alerts go from Saroh's own email (`common/email.ts`), not the
 * business's provider (DEC-011, amended 2026-10-07), so nothing here needs
 * the transactional send path.
 */
@Module({
    imports: [
        JobsModule,
        AuditModule,
        CapabilitiesModule,
        FeatureFlagModule,
        forwardRef(() => OrganizationsModule),
    ],
    controllers: [NotificationsController, NotificationPreferencesController],
    providers: [
        NotificationsService,
        NotificationPreferencesService,
        EnquiryNotifyHandler,
        TeamAlertHandler,
        OrganizationGuard,
    ],
    exports: [NotificationsService],
})
export class NotificationsModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly handler: EnquiryNotifyHandler,
        private readonly teamAlerts: TeamAlertHandler,
    ) {}

    /** Wire the enquiry and team-alert consumers into the job worker at boot. */
    onModuleInit(): void {
        this.registry.register(ENQUIRY_NOTIFY_TYPE, this.handler.handle);
        this.registry.register(TEAM_ALERT_TYPE, this.teamAlerts.handle);
    }
}
