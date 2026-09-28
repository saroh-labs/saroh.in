import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import type { WaitlistRosterRow } from "./waitlist.service";
import { WaitlistService } from "./waitlist.service";

/**
 * A class's waitlist for the team (round-2 A12): who is in line for one
 * session, in order, on the class's booking. `booking:read`, as the
 * roster it sits beside. Joining and leaving are the customer's, from the
 * booking page (`AccountWaitlistController`).
 */
@Controller("organizations/:organizationId/services")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
export class WaitlistController {
    constructor(private readonly waitlist: WaitlistService) {}

    /** `?startAt=` names the session. */
    @Get(":serviceId/waitlist")
    roster(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Query("startAt") startAt?: string,
    ): Promise<{ rows: WaitlistRosterRow[] }> {
        return this.waitlist.roster(ctx, serviceId, startAt ?? "");
    }
}
