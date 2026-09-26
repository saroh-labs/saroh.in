import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import {
    AdjustStockDto,
    CountStockDto,
    MoveStockDto,
    ResolveCheckDto,
    ReverseStockDto,
    SetStockTrackingDto,
    SetWarningsDto,
    StockChecksQueryDto,
    StockEntryDto,
    StockLevelsQueryDto,
    StockLogQueryDto,
} from "./dto";
import { StockChecksService } from "./stock-checks.service";
import { StockReadsService } from "./stock-reads.service";
import { StockTrackingService } from "./stock-tracking.service";
import { StockWritesService } from "./stock-writes.service";

/**
 * The Stock API (#514): what the Stock screen, the products list's quick
 * look and the product page read and write. Org-nested, so the business is
 * the one the guard proved. Reading needs `store:read`; writing needs
 * "Count and move stock" (`inventory:write`, or `store:write`). Who may see
 * people's names and order links is decided in the services
 * (`stock-access.ts`).
 */
@Controller("organizations/:organizationId/stock")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class StockController {
    constructor(
        private readonly reads: StockReadsService,
        private readonly writes: StockWritesService,
        private readonly checks: StockChecksService,
        private readonly tracking: StockTrackingService,
    ) {}

    /** Levels: a row per product or variant, a cell per storefront. */
    @Get()
    levels(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: StockLevelsQueryDto,
    ) {
        return this.reads.levels(ctx, query);
    }

    /** The stock log, newest first, a page at a time. */
    @Get("log")
    log(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: StockLogQueryDto,
    ) {
        return this.reads.log(ctx, query);
    }

    /** Count shelves; each row carries what was shown and what was counted. */
    @Post("counts")
    @HttpCode(201)
    counts(@OrgContext() ctx: OrganizationContext, @Body() dto: CountStockDto) {
        return this.writes.counts(ctx, dto);
    }

    /** When shelves warn — no count, no entry in the log. */
    @Put("warnings")
    warnings(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SetWarningsDto,
    ) {
        return this.writes.warnings(ctx, dto);
    }

    /** Received, baked, wasted, or returned by a customer. */
    @Post("entries")
    @HttpCode(201)
    entries(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: StockEntryDto,
    ) {
        return this.writes.entries(ctx, dto);
    }

    /** "+N · Add" — units received. */
    @Post("adjust")
    @HttpCode(201)
    adjust(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: AdjustStockDto,
    ) {
        return this.writes.adjust(ctx, dto);
    }

    /** Move units not promised to another storefront. */
    @Post("moves")
    @HttpCode(201)
    move(@OrgContext() ctx: OrganizationContext, @Body() dto: MoveStockDto) {
        return this.writes.move(ctx, dto);
    }

    /** Undo hand-made changes, all or none. */
    @Post("reverse")
    @HttpCode(201)
    reverse(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: ReverseStockDto,
    ) {
        return this.writes.reverse(ctx, dto);
    }

    /** What needs looking at: short, counts, sales, promises. */
    @Get("checks")
    listChecks(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: StockChecksQueryDto,
    ) {
        return this.checks.list(ctx, query);
    }

    /** The business's Track stock switch (#515). */
    @Get("tracking")
    getTracking(@OrgContext() ctx: OrganizationContext) {
        return this.tracking.get(ctx);
    }

    /**
     * Turn Track stock on or off for every product (`store:write`). Off is
     * refused while anything is promised; it counts every shelf to 0.
     */
    @Put("tracking")
    setTracking(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SetStockTrackingDto,
    ) {
        return this.tracking.set(ctx, dto.tracked);
    }

    @Post("checks/:key/resolve")
    @HttpCode(200)
    resolveCheck(
        @OrgContext() ctx: OrganizationContext,
        @Param("key") key: string,
        @Body() dto: ResolveCheckDto,
    ) {
        return this.checks.resolve(ctx, key, dto);
    }
}
