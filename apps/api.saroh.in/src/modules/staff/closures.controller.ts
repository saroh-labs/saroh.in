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
import { RequireModule } from "../capabilities/require-module.decorator";
import type { ClosureView } from "./closures.service";
import { ClosuresService } from "./closures.service";
import { AddClosureDto, PreviewOffDto, RemoveOffDto } from "./dto";
import type { BookingBrief } from "./off-bookings";

/**
 * "Everyone — business closed" (E3). Part of Appointments. Reads need
 * `service:read`, writes `service:write` — decided in {@link ClosuresService}.
 */
@Controller("organizations/:organizationId/closures")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
export class ClosuresController {
    constructor(private readonly closures: ClosuresService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext): Promise<ClosureView[]> {
        return this.closures.list(ctx);
    }

    /** Close the business; answers with the kept bookings it covers. */
    @Post()
    @HttpCode(201)
    add(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: AddClosureDto,
    ): Promise<{ closures: ClosureView[]; affected: BookingBrief[] }> {
        return this.closures.add(ctx, dto);
    }

    /** Open again: every row of one line, or none. */
    @Post("remove")
    @HttpCode(200)
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: RemoveOffDto,
    ): Promise<ClosureView[]> {
        return this.closures.remove(ctx, dto.ids);
    }
}

/**
 * What time off or a closure would cover, before it is saved (E3). A read
 * that takes a body, so a POST; it writes nothing.
 */
@Controller("organizations/:organizationId/time-off")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
export class TimeOffPreviewController {
    constructor(private readonly closures: ClosuresService) {}

    @Post("preview")
    @HttpCode(200)
    preview(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: PreviewOffDto,
    ): Promise<{ affected: BookingBrief[] }> {
        return this.closures.preview(ctx, dto);
    }
}
