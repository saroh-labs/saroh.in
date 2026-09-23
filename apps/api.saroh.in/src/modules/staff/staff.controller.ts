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
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { BookingRulesValue } from "../bookings/booking-rules";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import {
    AddExtraHoursDto,
    AddTimeOffDto,
    CreateStaffDto,
    ReplaceStaffHoursDto,
    SetStaffServicesDto,
    UpdateBookingRulesDto,
    UpdateStaffDto,
} from "./dto";
import type { BookingBrief, StaffList, StaffView } from "./staff.service";
import { StaffService } from "./staff.service";

/**
 * The people who take bookings, their hours, time off and extra hours (U3).
 * Part of Appointments. Reads need `service:read`, writes `service:write` —
 * decided in {@link StaffService}.
 */
@Controller("organizations/:organizationId/staff")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
export class StaffController {
    constructor(private readonly staff: StaffService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext): Promise<StaffList> {
        return this.staff.list(ctx);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateStaffDto,
    ): Promise<StaffView> {
        return this.staff.create(ctx, dto);
    }

    @Get(":staffId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("staffId") staffId: string,
    ): Promise<StaffView> {
        return this.staff.get(ctx, staffId);
    }

    @Patch(":staffId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("staffId") staffId: string,
        @Body() dto: UpdateStaffDto,
    ): Promise<StaffView> {
        return this.staff.update(ctx, staffId, dto);
    }

    /** Off the diary for new bookings; their bookings and hours stay. */
    @Delete(":staffId")
    archive(
        @OrgContext() ctx: OrganizationContext,
        @Param("staffId") staffId: string,
    ): Promise<StaffView> {
        return this.staff.archive(ctx, staffId);
    }

    @Put(":staffId/services")
    setServices(
        @OrgContext() ctx: OrganizationContext,
        @Param("staffId") staffId: string,
        @Body() dto: SetStaffServicesDto,
    ): Promise<StaffView> {
        return this.staff.setServices(ctx, staffId, dto.serviceIds);
    }

    /** Replace the weekly hours; answers with the kept bookings now outside them. */
    @Put(":staffId/hours")
    replaceHours(
        @OrgContext() ctx: OrganizationContext,
        @Param("staffId") staffId: string,
        @Body() dto: ReplaceStaffHoursDto,
    ): Promise<{ staff: StaffView; outside: BookingBrief[] }> {
        return this.staff.replaceHours(ctx, staffId, dto.hours);
    }

    @Post(":staffId/extra-hours")
    @HttpCode(201)
    addExtraHours(
        @OrgContext() ctx: OrganizationContext,
        @Param("staffId") staffId: string,
        @Body() dto: AddExtraHoursDto,
    ): Promise<StaffView> {
        return this.staff.addExtraHours(ctx, staffId, dto);
    }

    @Delete(":staffId/extra-hours/:extraHoursId")
    removeExtraHours(
        @OrgContext() ctx: OrganizationContext,
        @Param("staffId") staffId: string,
        @Param("extraHoursId") extraHoursId: string,
    ): Promise<{ staff: StaffView; outside: BookingBrief[] }> {
        return this.staff.removeExtraHours(ctx, staffId, extraHoursId);
    }

    /** Time off; answers with the kept bookings it covers. */
    @Post(":staffId/time-off")
    @HttpCode(201)
    addTimeOff(
        @OrgContext() ctx: OrganizationContext,
        @Param("staffId") staffId: string,
        @Body() dto: AddTimeOffDto,
    ): Promise<{ staff: StaffView; affected: BookingBrief[] }> {
        return this.staff.addTimeOff(ctx, staffId, dto);
    }

    @Delete(":staffId/time-off/:timeOffId")
    removeTimeOff(
        @OrgContext() ctx: OrganizationContext,
        @Param("staffId") staffId: string,
        @Param("timeOffId") timeOffId: string,
    ): Promise<StaffView> {
        return this.staff.removeTimeOff(ctx, staffId, timeOffId);
    }
}

/** The business's booking rules (U3): book ahead, latest booking, free cancellation. */
@Controller("organizations/:organizationId/booking-rules")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
export class BookingRulesController {
    constructor(private readonly staff: StaffService) {}

    @Get()
    get(@OrgContext() ctx: OrganizationContext): Promise<BookingRulesValue> {
        return this.staff.getBookingRules(ctx);
    }

    @Put()
    update(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: UpdateBookingRulesDto,
    ): Promise<BookingRulesValue> {
        return this.staff.updateBookingRules(ctx, dto);
    }
}
