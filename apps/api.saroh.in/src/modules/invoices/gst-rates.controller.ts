import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { SetGstRatesDto } from "./gst-rates.dto";
import { GstRatesService } from "./gst-rates.service";

/**
 * The GST rates a business still has to choose, and the save that chooses
 * them (`gst-rates.service.ts`).
 *
 * It spans Bookings' services and Sell's products, so it carries no module
 * gate: the service reads each kind with that kind's own permission, and a
 * save asks for the permission its editor asks for.
 */
@Controller("organizations/:organizationId/gst-rates")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class GstRatesController {
    constructor(private readonly rates: GstRatesService) {}

    /** Priced things on sale with no GST rate; none unless registered. */
    @Get("missing")
    missing(@OrgContext() ctx: OrganizationContext) {
        return this.rates.missing(ctx);
    }

    /** Save a rate on each item named. */
    @Put()
    set(@OrgContext() ctx: OrganizationContext, @Body() dto: SetGstRatesDto) {
        return this.rates.set(ctx, dto);
    }
}
