import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { CalendarMonth } from "./calendar.service";
import { CalendarService } from "./calendar.service";
import { CalendarMonthQueryDto } from "./dto";

/**
 * The Business Calendar's month (U4): everything dated, per day and layer,
 * in one read. Not module-gated: it spans modules and leaves out, layer by
 * layer, whatever is off or the viewer may not read — like Home.
 */
@Controller("organizations/:organizationId/calendar")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class CalendarController {
    constructor(private readonly calendar: CalendarService) {}

    @Get()
    month(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: CalendarMonthQueryDto,
    ): Promise<CalendarMonth> {
        return this.calendar.month(ctx, query.month);
    }
}
