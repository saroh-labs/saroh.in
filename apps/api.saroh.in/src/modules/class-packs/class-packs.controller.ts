import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { ClassPacksService } from "./class-packs.service";
import {
    ListPacksQueryDto,
    ListPurchasesQueryDto,
    PackInputDto,
    SellPackDto,
    UsePackDto,
} from "./dto";

/**
 * Schedule → Class packs (ADR-007). Booked time sold ahead, so it sits under
 * Appointments with bookings. Selling one invoices it when Payments is on,
 * which the service decides — Payments is not required to sell a pack.
 * Authorization is in the service.
 */
@Controller("organizations/:organizationId/class-packs")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
export class ClassPacksController {
    constructor(private readonly packs: ClassPacksService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListPacksQueryDto,
    ) {
        return this.packs.listPacks(ctx, query);
    }

    /** Declared before `:packId`, or "purchases" would be read as a pack id. */
    @Get("purchases")
    purchases(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListPurchasesQueryDto,
    ) {
        return this.packs.listPurchases(ctx, query);
    }

    @Get("purchases/:purchaseId")
    purchase(
        @OrgContext() ctx: OrganizationContext,
        @Param("purchaseId") id: string,
    ) {
        return this.packs.getPurchase(ctx, id);
    }

    @Get(":packId")
    get(@OrgContext() ctx: OrganizationContext, @Param("packId") id: string) {
        return this.packs.getPack(ctx, id);
    }

    @Post()
    @HttpCode(201)
    create(@OrgContext() ctx: OrganizationContext, @Body() dto: PackInputDto) {
        return this.packs.createPack(ctx, dto);
    }

    @Patch(":packId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("packId") id: string,
        @Body() dto: PackInputDto,
    ) {
        return this.packs.updatePack(ctx, id, dto);
    }

    @Post(":packId/archive")
    @HttpCode(200)
    archive(
        @OrgContext() ctx: OrganizationContext,
        @Param("packId") id: string,
    ) {
        return this.packs.setPackStatus(ctx, id, "ARCHIVED");
    }

    @Post(":packId/restore")
    @HttpCode(200)
    restore(
        @OrgContext() ctx: OrganizationContext,
        @Param("packId") id: string,
    ) {
        return this.packs.setPackStatus(ctx, id, "ACTIVE");
    }

    /** Sell the pack to a contact; answers with the purchase and its balance. */
    @Post(":packId/sell")
    @HttpCode(201)
    sell(
        @OrgContext() ctx: OrganizationContext,
        @Param("packId") id: string,
        @Body() dto: SellPackDto,
    ) {
        return this.packs.sell(ctx, id, dto);
    }
}

/** "Use a class pack" on a booking already made, and taking it back off. */
@Controller("organizations/:organizationId/bookings/:bookingId/class-pack")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
export class BookingClassPackController {
    constructor(private readonly packs: ClassPacksService) {}

    @Post()
    @HttpCode(200)
    use(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId") bookingId: string,
        @Body() dto: UsePackDto,
    ) {
        return this.packs.useOnBooking(ctx, bookingId, dto);
    }

    @Delete()
    @HttpCode(200)
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId") bookingId: string,
    ) {
        return this.packs.removeFromBooking(ctx, bookingId);
    }
}
