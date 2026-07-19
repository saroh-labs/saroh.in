import type { OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import {
    ENQUIRY_NOTIFY_TYPE,
    EnquiryNotifyHandler,
} from "./enquiry-notify.handler";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

/**
 * New-enquiry notifications (S3-006).
 *
 * Two halves wired together:
 *  - The CONSUMER: {@link EnquiryNotifyHandler} is registered with the
 *    {@link JobHandlerRegistry} (from {@link JobsModule}) for the
 *    `enquiry.notify` job type on boot, so the durable job worker delivers each
 *    committed enquiry as one in-app Notification + email.
 *  - The READ surface: {@link NotificationsController} / {@link
 *    NotificationsService} let an org's owners/admins list + acknowledge their
 *    inbox, behind the same double-guard as the other org-scoped modules
 *    ({@link OrganizationsModule} supplies the `OrganizationContextService` that
 *    `OrganizationGuard` needs, via forwardRef).
 */
@Module({
    imports: [JobsModule, forwardRef(() => OrganizationsModule)],
    controllers: [NotificationsController],
    providers: [NotificationsService, EnquiryNotifyHandler, OrganizationGuard],
    exports: [NotificationsService],
})
export class NotificationsModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly handler: EnquiryNotifyHandler,
    ) {}

    /** Wire the enquiry-notify consumer into the job worker at boot. */
    onModuleInit(): void {
        this.registry.register(ENQUIRY_NOTIFY_TYPE, this.handler.handle);
    }
}
