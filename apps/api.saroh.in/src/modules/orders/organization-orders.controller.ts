import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Param,
    ParseIntPipe,
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
import { orderPayLinkUrlFor } from "../invoices/pay-link-url";
import { allows, authorize } from "../organizations/organization-policy";
import {
    EditOrderDto,
    ListOrdersQuery,
    MoveStageDto,
    OrderFilterOptionsQuery,
    OrderProductsQuery,
    RecordDifferenceDto,
    UndoStageDto,
} from "./dto";
import { OrderCancelService } from "./order-cancel.service";
import { CancelOrderDto, ChangeFulfilmentDto } from "./order-change.dto";
import { OrderFulfilmentChangeService } from "./order-fulfilment-change.service";
import { OrderKitchenService } from "./order-kitchen.service";
import { OrderPayLinkService } from "./order-pay-link.service";
import { quickViewOf } from "./order-row";
import { CreateStageBatchDto } from "./order-stage-batch.dto";
import { OrderStageBatchService } from "./order-stage-batch.service";
import { OrdersService } from "./orders.service";

/**
 * Who may list the business's orders: `order:read` in full, or
 * `order:stage` for the kitchen's view (DEC-024); anyone else is refused.
 * True when the caller reads them in full, money included.
 */
function listAccess(ctx: OrganizationContext): boolean {
    const full = allows(ctx, "order:read");
    if (!full && !allows(ctx, "order:stage")) authorize(ctx, "order:read");
    return full;
}

/**
 * Orders across the whole business — what Sell → Orders reads.
 *
 * Its own controller rather than another route on `OrdersController`, because
 * the two are scoped by different things and that difference is the entire
 * security boundary: the store-scoped one takes a `:storeId` from the path and
 * checks the caller against that store, while this one takes its organization
 * from `OrganizationGuard` and never trusts a tenant id off the wire.
 * Splitting them keeps a guard from being the only thing standing between the
 * two, where a future edit could quietly move a route across the line.
 *
 * A merchant with three storefronts had no way to see the orders waiting in
 * all of them at once; the rail badged a number that no screen could show.
 *
 * One order's kitchen flow (ADR-008, U6) lives here too — the read Order
 * Detail renders, stage moves, undo and edits — for the same reason: it is
 * scoped by the organization, and a Member at the counter reaches it with
 * `order:stage` alone. The services authorize; see OrderKitchenService.
 *
 * Commerce is required per handler, not on the class (#117): every route
 * that takes, moves, changes, charges or cancels an order carries
 * `@RequireModule("COMMERCE")`. The reads of orders already taken — the
 * list (and its export), its filters, its product search and one order —
 * are history, and stay readable when a business switches Commerce off
 * (`MODULE_ROLLOUT.md`). Refunds stay open too; they live on
 * `payments/orders/:orderId/refund`.
 */
@Controller("organizations/:organizationId/orders")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
export class OrganizationOrdersController {
    constructor(
        private readonly orders: OrdersService,
        private readonly kitchen: OrderKitchenService,
        private readonly payLinks: OrderPayLinkService,
        private readonly fulfilment: OrderFulfilmentChangeService,
        private readonly cancels: OrderCancelService,
        private readonly batches: OrderStageBatchService,
    ) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListOrdersQuery = {},
    ) {
        // The guards prove the caller belongs to this business and that
        // Commerce is on. Neither says they may see its ORDERS — customer
        // names, emails and totals across every storefront. This line was
        // missing when the screen first shipped, and a Reviewer, brought in to
        // look at one website, could list every order in the business.
        //
        // `order:stage` reaches it too (DEC-024): a Member at the counter
        // needs the list to open the order in front of them. They get the
        // kitchen's view of it — no totals and no customer emails — the same
        // line the order read draws.
        const full = listAccess(ctx);
        // Export reads the same pages (B4), and taking every order away in a
        // file is its own power (B16, matrix §3): `order:export`.
        if (query.export === "true") authorize(ctx, "order:export");

        // Rows, tab counts and a cursor (plan B, B1), with or without `v=2`:
        // the bare array an app before B1 read went in the contract release
        // (B2d). Money needs `order:read`; a customer's phone and email need
        // `contact:read`. Every filter narrows within the organization.
        //
        // Each row carries the customer's Needs attention as the caller may
        // see it, and `attention=` filters on the same (B15): sensitive
        // entries count only for a caller who may read them.
        const {
            v: _v,
            export: _export,
            late,
            attention,
            since,
            ...filter
        } = query;
        return this.orders.listRows(
            ctx.organizationId,
            {
                ...filter,
                late: late === undefined ? undefined : late === "true",
                attention:
                    attention === undefined ? undefined : attention === "true",
                since: since ? new Date(since) : undefined,
            },
            {
                money: full,
                contact: allows(ctx, "contact:read"),
                viewer: ctx,
            },
        );
    }

    /**
     * What the list's filter bar offers (B4): the ways and steps the
     * business's orders show, and the name of the product a link names.
     * Whoever may list orders may ask. Declared before `:orderId`, which
     * would otherwise take "filters" for an order id.
     */
    @Get("filters")
    filters(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: OrderFilterOptionsQuery = {},
    ) {
        listAccess(ctx);
        return this.orders.filterOptions(ctx.organizationId, query.productId);
    }

    /** The Product filter's search (B4): products on the business's orders. */
    @Get("products")
    products(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: OrderProductsQuery = {},
    ) {
        listAccess(ctx);
        return this.orders.searchProducts(ctx.organizationId, query.q);
    }

    /**
     * Bulk kitchen moves (B6, `order:stage`): hold a batch the list made,
     * read it back, send it now, cancel it while held, or undo it all.
     * Declared before `:orderId`, whose routes would otherwise read "stage"
     * as an order id.
     */
    @Post("stage/batches")
    @RequireModule("COMMERCE")
    @HttpCode(200)
    createBatch(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateStageBatchDto,
    ) {
        return this.batches.create(ctx, dto);
    }

    @Get("stage/batches/:batchId")
    @RequireModule("COMMERCE")
    readBatch(
        @OrgContext() ctx: OrganizationContext,
        @Param("batchId") batchId: string,
    ) {
        return this.batches.get(ctx, batchId);
    }

    @Post("stage/batches/:batchId/commit")
    @RequireModule("COMMERCE")
    @HttpCode(200)
    commitBatch(
        @OrgContext() ctx: OrganizationContext,
        @Param("batchId") batchId: string,
    ) {
        return this.batches.commit(ctx, batchId);
    }

    @Post("stage/batches/:batchId/cancel")
    @RequireModule("COMMERCE")
    @HttpCode(200)
    cancelBatch(
        @OrgContext() ctx: OrganizationContext,
        @Param("batchId") batchId: string,
    ) {
        return this.batches.cancel(ctx, batchId);
    }

    @Post("stage/batches/:batchId/undo")
    @RequireModule("COMMERCE")
    @HttpCode(200)
    undoBatch(
        @OrgContext() ctx: OrganizationContext,
        @Param("batchId") batchId: string,
    ) {
        return this.batches.undo(ctx, batchId);
    }

    /**
     * One order as Order Detail shows it; money only with a money read.
     *
     * `?view=quick` is the Orders list's quick view (B5): the same read,
     * with the customer's phone and email left out without `contact:read`,
     * as the list's rows leave them out (`quickViewOf`). Any other value is
     * the full read, so an older app is unaffected.
     */
    @Get(":orderId")
    async read(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Query("view") view?: string,
    ) {
        const read = await this.kitchen.read(ctx, orderId);
        return view === "quick"
            ? quickViewOf(read, { contact: allows(ctx, "contact:read") })
            : read;
    }

    /** Move to the next kitchen stage (`order:stage`). */
    @Post(":orderId/stage")
    @RequireModule("COMMERCE")
    @HttpCode(200)
    moveStage(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: MoveStageDto,
    ) {
        return this.kitchen.moveStage(ctx, orderId, dto);
    }

    /**
     * "Mark visit N attended" on a treatment's order (B14): `order:stage`,
     * once the visit has started. The last visit attended fulfils the order.
     */
    @Post(":orderId/visits/:visitNumber/attended")
    @RequireModule("COMMERCE")
    @HttpCode(200)
    markVisitAttended(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Param("visitNumber", ParseIntPipe) visitNumber: number,
    ) {
        return this.kitchen.markVisitAttended(ctx, orderId, visitNumber);
    }

    /** Undo the last kitchen step (`order:stage`). */
    @Post(":orderId/stage/undo")
    @RequireModule("COMMERCE")
    @HttpCode(200)
    undoStage(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: UndoStageDto,
    ) {
        return this.kitchen.undoStage(ctx, orderId, dto.eventId);
    }

    /**
     * Make the order's pay link and answer with it — once: only its hash is
     * kept, so asking again makes a new link and the old one stops working
     * (B11). `order:create` or `order:edit` (B16; see OrderPayLinkService).
     */
    @Post(":orderId/pay-link")
    @RequireModule("COMMERCE")
    @HttpCode(201)
    @Header("Cache-Control", "no-store")
    async payLink(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
    ): Promise<{ url: string; payLinkCreatedAt: Date }> {
        const { token, payLinkCreatedAt } = await this.payLinks.make(
            ctx,
            orderId,
        );
        return {
            url: await orderPayLinkUrlFor(ctx.organizationId, token),
            payLinkCreatedAt,
        };
    }

    /**
     * "Record payment" (audit, 6 Oct 2026): what a paid order still owes —
     * an edit's difference — was paid in cash, by UPI or by card at the
     * counter. `order:edit`, as any payment recorded by hand (B16).
     */
    @Post(":orderId/record-payment")
    @RequireModule("COMMERCE")
    @HttpCode(200)
    recordDifference(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: RecordDifferenceDto,
    ) {
        return this.kitchen.recordDifference(ctx, orderId, dto);
    }

    /**
     * "Change how it's fulfilled…" (B9): until handover, to a way every
     * item allows and the storefront offers, with the delivery charge staff
     * type; the difference is charged or refunded. `order:edit` (and
     * `order:refund` when a paid order's money moves, B16).
     */
    @Post(":orderId/fulfilment")
    @RequireModule("COMMERCE")
    @HttpCode(200)
    changeFulfilment(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: ChangeFulfilmentDto,
    ) {
        return this.fulfilment.change(ctx, orderId, dto);
    }

    /**
     * "Cancel order…" (B9): a refund in full, and the order kept as
     * cancelled. Refused from its handover on. `order:refund` (B16): a
     * cancel is a refund in full.
     */
    @Post(":orderId/cancel")
    @RequireModule("COMMERCE")
    @HttpCode(200)
    cancel(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: CancelOrderDto,
    ) {
        return this.cancels.cancel(ctx, orderId, dto);
    }

    /**
     * Change lines, fulfilment, address or notes (`order:edit`; the courier
     * and number alone are `order:stage`'s; money moving on a paid order
     * also takes `order:refund`, B16).
     */
    @Patch(":orderId")
    @RequireModule("COMMERCE")
    edit(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: EditOrderDto,
    ) {
        return this.kitchen.edit(ctx, orderId, dto);
    }
}
