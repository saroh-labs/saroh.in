import { Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { WebAddressAvailability, WebAddressView } from "./web-address.dto";
import { ChangeWebAddressDto } from "./web-address.dto";
import { WebAddressService } from "./web-address.service";

/**
 * The business's web address (DEC-069, plan L2). Tenancy, not a module:
 * the address is the business's whichever modules are on. The service
 * authorizes each route (`org:settings:read` to read and check,
 * `org:address:update` — the owner's — to change).
 */
@Controller("organizations/:organizationId/web-address")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class WebAddressController {
    constructor(private readonly webAddress: WebAddressService) {}

    /** The address, where customers go, its live links and old addresses. */
    @Get()
    read(@OrgContext() ctx: OrganizationContext): Promise<WebAddressView> {
        return this.webAddress.read(ctx);
    }

    /** Whether `?address=` is free to this business, with a suggestion. */
    @Get("availability")
    availability(
        @OrgContext() ctx: OrganizationContext,
        @Query("address") address: unknown,
    ): Promise<WebAddressAvailability> {
        // A repeated `?address=` arrives as an array; it asks about nothing.
        return this.webAddress.availability(
            ctx,
            typeof address === "string" ? address : "",
        );
    }

    /** Move the business to a new address; answers the read. */
    @Put()
    change(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: ChangeWebAddressDto,
    ): Promise<WebAddressView> {
        return this.webAddress.change(ctx, dto.address);
    }
}
