import { Body, Get, Param, Patch, Post, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminPermission } from "../admin/admin-permissions";
import { AdminRoutes } from "../admin/admin-routes.decorator";
import { SarohBusinessContactsService } from "./business-contacts.service";
import {
    AddLeadDto,
    AssignLeadDto,
    LeadsBoardQueryDto,
    LogBusinessContactDto,
    LogContactDto,
    MoveLeadStageDto,
    UpdateLeadDto,
} from "./dto";
import { SarohLeadWritesService } from "./saroh-lead-writes.service";
import { SarohLeadsService } from "./saroh-leads.service";

/**
 * Saroh's own sales leads in the console (DEC-169, admin console U20),
 * under `/admin/saroh-leads`. Registered by the admin module, so the
 * console's guard stack and its permission contract cover every route.
 *
 * Reads need `saroh-leads:read` and writes `saroh-leads:write`; the service
 * scopes both through `scopeForStaff`, so an Account manager reaches only
 * the leads they own (another's is a 403). Giving a lead out, and the list
 * of who to give it to, are for Support and Platform owner alone. No
 * support session: a lead belongs to no business.
 */
@AdminRoutes()
export class SarohLeadsController {
    constructor(
        private readonly leads: SarohLeadsService,
        private readonly writes: SarohLeadWritesService,
        private readonly businessContacts: SarohBusinessContactsService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @Get("saroh-leads")
    @RequireAdminPermission(AdminPermission.SarohLeadsRead)
    leadsBoard(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: LeadsBoardQueryDto,
    ) {
        return this.leads.board(staff, query);
    }

    /** Who a lead may be given to. Before `:leadId`, so it isn't one. */
    @Get("saroh-leads/managers")
    @RequireAdminPermission(AdminPermission.SarohLeadsWrite)
    leadManagers(@PlatformAdminContext() staff: PlatformAdminInfo) {
        return this.leads.managers(staff);
    }

    @Get("saroh-leads/:leadId")
    @RequireAdminPermission(AdminPermission.SarohLeadsRead)
    leadDetail(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("leadId") leadId: string,
    ) {
        return this.leads.detail(staff, leadId);
    }

    @Get("saroh-leads/:leadId/log")
    @RequireAdminPermission(AdminPermission.SarohLeadsRead)
    leadLog(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("leadId") leadId: string,
    ) {
        return this.leads.log(staff, leadId);
    }

    @Get("saroh-leads/:leadId/won-candidates")
    @RequireAdminPermission(AdminPermission.SarohLeadsRead)
    leadWonCandidates(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("leadId") leadId: string,
    ) {
        return this.leads.wonCandidates(staff, leadId);
    }

    @Post("saroh-leads")
    @RequireAdminPermission(AdminPermission.SarohLeadsWrite)
    addLead(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: AddLeadDto,
    ) {
        const { idempotencyKey, ...input } = dto;
        return this.idempotency.run(
            {
                scope: "admin.saroh-lead.add",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            input,
            () => this.writes.add(staff, input),
        );
    }

    @Patch("saroh-leads/:leadId")
    @RequireAdminPermission(AdminPermission.SarohLeadsWrite)
    updateLead(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("leadId") leadId: string,
        @Body() dto: UpdateLeadDto,
    ) {
        const { idempotencyKey, ...input } = dto;
        return this.idempotency.run(
            {
                scope: "admin.saroh-lead.update",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            { leadId, ...input },
            () => this.writes.update(staff, leadId, input),
        );
    }

    @Post("saroh-leads/:leadId/stage")
    @RequireAdminPermission(AdminPermission.SarohLeadsWrite)
    moveLeadStage(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("leadId") leadId: string,
        @Body() dto: MoveLeadStageDto,
    ) {
        const { idempotencyKey, ...input } = dto;
        return this.idempotency.run(
            {
                scope: "admin.saroh-lead.stage",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            { leadId, ...input },
            () => this.writes.moveStage(staff, leadId, input),
        );
    }

    @Post("saroh-leads/:leadId/assign")
    @RequireAdminPermission(AdminPermission.SarohLeadsWrite)
    assignLead(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("leadId") leadId: string,
        @Body() dto: AssignLeadDto,
    ) {
        const { idempotencyKey, ...input } = dto;
        return this.idempotency.run(
            {
                scope: "admin.saroh-lead.assign",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            { leadId, ...input },
            () => this.writes.assign(staff, leadId, input),
        );
    }

    @Post("saroh-leads/:leadId/log")
    @RequireAdminPermission(AdminPermission.SarohLeadsWrite)
    logLeadContact(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("leadId") leadId: string,
        @Body() dto: LogContactDto,
    ) {
        const { idempotencyKey, ...input } = dto;
        return this.idempotency.run(
            {
                scope: "admin.saroh-lead.log",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            { leadId, ...input },
            () => this.writes.logContact(staff, leadId, input),
        );
    }

    /**
     * Log a call, visit or message with a business one looks after (admin
     * console U22): the member page's Log a call. An Account manager only
     * with their own businesses.
     */
    @Post("organizations/:organizationId/contact-log")
    @RequireAdminPermission(AdminPermission.SarohLeadsWrite)
    logBusinessContact(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: LogBusinessContactDto,
    ) {
        const { idempotencyKey, ...input } = dto;
        return this.idempotency.run(
            {
                scope: "admin.business.contact-log",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            { organizationId, ...input },
            () => this.businessContacts.log(staff, organizationId, input),
        );
    }
}
