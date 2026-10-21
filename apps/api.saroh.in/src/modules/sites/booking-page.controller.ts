import {
    Body,
    Controller,
    Get,
    HttpCode,
    Post,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import {
    IgnoreModuleReadiness,
    RequireModule,
} from "../capabilities/require-module.decorator";
import type { BookingPageView } from "./booking-page.service";
import { BookingPageService } from "./booking-page.service";
import { GoLiveOptionsDto } from "./dto";

/**
 * "Your booking page" in Bookings (DEC-175, #1158), scoped to
 * `/organizations/:organizationId/booking-page`.
 *
 * Gated on Bookings, not Website: the booking page is published from
 * Bookings without going through Website. Bookings with its setup still to
 * finish (no service yet) still reads it, and is told what is missing. The
 * service authorizes each route.
 */
@Controller("organizations/:organizationId/booking-page")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
@IgnoreModuleReadiness()
export class BookingPageController {
    constructor(private readonly bookingPage: BookingPageService) {}

    /** Where the booking page is, whether customers can open it, who may publish. */
    @Get()
    read(@OrgContext() ctx: OrganizationContext): Promise<BookingPageView> {
        return this.bookingPage.read(ctx);
    }

    /** Make my booking page: the starter site, not published. */
    @Post()
    @HttpCode(200)
    make(@OrgContext() ctx: OrganizationContext): Promise<BookingPageView> {
        return this.bookingPage.make(ctx);
    }

    /** Publish booking page: publish the website it is on. */
    @Post("publish")
    @HttpCode(200)
    publish(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: GoLiveOptionsDto,
    ): Promise<BookingPageView> {
        return this.bookingPage.publish(ctx, { override: dto.override });
    }
}
