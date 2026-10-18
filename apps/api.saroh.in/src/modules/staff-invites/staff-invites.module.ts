import { Module } from "@nestjs/common";

import { AdminAuditService } from "../admin/admin-audit.service";
import { AdminStaffInvitesService } from "../admin/admin-staff-invites.service";
import { StaffInviteMailer } from "../admin/staff-invite-mailer";
import {
    PublicStaffInvitesController,
    StaffInviteAcceptController,
} from "./staff-invites.controller";

/**
 * Staff invites (DEC-169, admin console U24). Its own module so the two
 * routes a person who is not staff yet reaches (the public preview and the
 * session-only accept) sit outside `AdminModule`, whose every controller is
 * `@AdminRoutes()` (`admin.controller.permissions.spec.ts`). The console's
 * create, resend and withdraw are on `AdminStaffController`, which uses the
 * service exported here.
 */
@Module({
    controllers: [PublicStaffInvitesController, StaffInviteAcceptController],
    providers: [AdminAuditService, StaffInviteMailer, AdminStaffInvitesService],
    exports: [AdminStaffInvitesService],
})
export class StaffInvitesModule {}
