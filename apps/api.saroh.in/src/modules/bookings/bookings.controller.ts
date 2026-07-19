import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from "@nestjs/common";

import type { Booking, Service } from "@saroh/database";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "./bookings.service";
import {
    AddRuleDto,
    CreateServiceDto,
    ReplaceRulesDto,
    UpdateServiceDto,
} from "./dto";

/**
 * Authorized bookable-Service + availability + booking management for an
 * Organization (S4-002), scoped to `/organizations/:organizationId/services`.
 *
 * Double-guarded: `BetterAuthGuard` authenticates the session user and
 * `OrganizationGuard` resolves an authorized {@link OrganizationContext} from
 * the `:organizationId` param. Handlers receive only that proven context via
 * `@OrgContext()`; the service enforces `service:*`/`booking:*` on top. The
 * PUBLIC booking endpoint is deliberately NOT here — it lives in the guardless
 * {@link PublicBookingsController}.
 */
@Controller("organizations/:organizationId/services")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class BookingsController {
    constructor(private readonly bookings: BookingsService) {}

    // ── Services ────────────────────────────────────────────────────────────

    @Post()
    @HttpCode(201)
    createService(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateServiceDto,
    ): Promise<Service> {
        return this.bookings.createService(ctx, dto);
    }

    @Get()
    listServices(@OrgContext() ctx: OrganizationContext): Promise<Service[]> {
        return this.bookings.listServices(ctx);
    }

    @Get(":serviceId")
    getService(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
    ): Promise<Service> {
        return this.bookings.getService(ctx, serviceId);
    }

    @Patch(":serviceId")
    updateService(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Body() dto: UpdateServiceDto,
    ): Promise<Service> {
        return this.bookings.updateService(ctx, serviceId, dto);
    }

    @Delete(":serviceId")
    removeService(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
    ): Promise<{ id: string; deleted: true }> {
        return this.bookings.removeService(ctx, serviceId);
    }

    // ── Availability rules ──────────────────────────────────────────────────

    @Get(":serviceId/rules")
    listRules(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
    ) {
        return this.bookings.listRules(ctx, serviceId);
    }

    @Put(":serviceId/rules")
    replaceRules(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Body() dto: ReplaceRulesDto,
    ) {
        return this.bookings.replaceRules(ctx, serviceId, dto.rules);
    }

    @Post(":serviceId/rules")
    @HttpCode(201)
    addRule(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Body() dto: AddRuleDto,
    ) {
        return this.bookings.addRule(ctx, serviceId, dto);
    }

    @Delete(":serviceId/rules/:ruleId")
    deleteRule(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Param("ruleId") ruleId: string,
    ): Promise<{ id: string; deleted: true }> {
        return this.bookings.deleteRule(ctx, serviceId, ruleId);
    }

    // ── Availability preview ────────────────────────────────────────────────

    @Get(":serviceId/availability")
    availability(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Query("from") from: string,
        @Query("to") to: string,
    ) {
        return this.bookings.availability(ctx, serviceId, from, to);
    }

    // ── Bookings ────────────────────────────────────────────────────────────

    @Get(":serviceId/bookings")
    listServiceBookings(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
    ): Promise<Booking[]> {
        return this.bookings.listBookings(ctx, serviceId);
    }

    @Delete("bookings/:bookingId")
    cancelBooking(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId") bookingId: string,
    ): Promise<Booking> {
        return this.bookings.cancelBooking(ctx, bookingId);
    }
}
