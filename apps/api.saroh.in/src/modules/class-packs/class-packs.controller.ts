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
    DeletePackDraftQueryDto,
    ListPacksQueryDto,
    ListPurchasesQueryDto,
    PackDraftDto,
    PackInputDto,
    PackRevisionDto,
    SellPackDto,
    UsePackDto,
} from "./dto";

/**
 * Bookings › Class packs (ADR-007). Booked time sold ahead: its own module,
 * CLASS_PACKS, which needs Appointments (E12, default 44). Selling one
 * invoices it when Payments is on, which the service decides — Payments is
 * not required to sell a pack. Authorization is in the service, and so is
 * the refusal to sell once the business switched Class packs off, which
 * holds whether or not enforcement is on.
 */
@Controller("organizations/:organizationId/class-packs")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("CLASS_PACKS")
export class ClassPacksController {
    constructor(private readonly packs: ClassPacksService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListPacksQueryDto,
    ) {
        return this.packs.listPacks(ctx, query);
    }

    /**
     * Whether selling a pack issues an invoice now (Payments on). Declared
     * before `:packId`, like "purchases".
     */
    @Get("selling")
    selling(@OrgContext() ctx: OrganizationContext) {
        return this.packs.sellingTerms(ctx);
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

    // — The Pack Editor's drafts (E14) ——————————————————————————————
    // Each write answers with the pack as the editor reads it; a stale
    // `revision` is a 409 naming who saved since, and writes nothing.

    /** The editor's first save of a new pack, which makes it a DRAFT. */
    @Post("drafts")
    @HttpCode(201)
    createDraft(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: PackInputDto,
    ) {
        return this.packs.createPackDraft(ctx, dto);
    }

    /** The pack as the editor reads it, with its draft revision. */
    @Get(":packId/draft")
    getDraft(
        @OrgContext() ctx: OrganizationContext,
        @Param("packId") id: string,
    ) {
        return this.packs.getPackEditor(ctx, id);
    }

    /** Autosave: a draft's fields, or a live pack's unpublished changes. */
    @Patch(":packId/draft")
    saveDraft(
        @OrgContext() ctx: OrganizationContext,
        @Param("packId") id: string,
        @Body() dto: PackDraftDto,
    ) {
        return this.packs.savePackDraft(ctx, id, dto);
    }

    @Post(":packId/publish")
    @HttpCode(200)
    publish(
        @OrgContext() ctx: OrganizationContext,
        @Param("packId") id: string,
        @Body() dto: PackRevisionDto,
    ) {
        return this.packs.publishPack(ctx, id, dto.revision);
    }

    @Post(":packId/discard")
    @HttpCode(200)
    discard(
        @OrgContext() ctx: OrganizationContext,
        @Param("packId") id: string,
        @Body() dto: PackRevisionDto,
    ) {
        return this.packs.discardPackChanges(ctx, id, dto.revision);
    }

    /** Delete a draft nobody has bought; a published pack is archived. */
    @Delete(":packId")
    @HttpCode(204)
    async remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("packId") id: string,
        @Query() query: DeletePackDraftQueryDto,
    ): Promise<void> {
        await this.packs.deletePackDraft(ctx, id, query.revision);
    }

    /**
     * The old pack form's whole-pack save, kept while the app moves to the
     * Pack Editor (E18). Refuses a draft.
     */
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

/**
 * "Use a class pack" on a booking already made, and taking it back off. Part
 * of Class packs: with it off, a booking already paid with a pack keeps
 * saying so (the booking read), and cancelling it in time still gives the class back
 * (the bookings controller).
 */
@Controller("organizations/:organizationId/bookings/:bookingId/class-pack")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("CLASS_PACKS")
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
