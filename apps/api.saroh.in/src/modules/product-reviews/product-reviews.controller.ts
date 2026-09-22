import {
    Body,
    Controller,
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
import { authorize } from "../organizations/organization-policy";
import { InviteReviewsDto, ReplyDto } from "./dto";
import { ProductReviewsService } from "./product-reviews.service";

/**
 * Products → Reviews, for the business. Org-nested so the business comes
 * from the path the guard proved, never from the body; every route
 * authorizes. Inviting also needs `order:read` — it is sent from an order and
 * names its customer.
 */
@Controller("organizations/:organizationId/product-reviews")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class ProductReviewsController {
    constructor(private readonly reviews: ProductReviewsService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query("productId") productId?: string,
        @Query("status") status?: string,
    ) {
        authorize(ctx, "product-review:read");
        return this.reviews.list(ctx.organizationId, { productId, status });
    }

    @Get("summary")
    summary(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "product-review:read");
        return this.reviews.summary(ctx.organizationId);
    }

    @Get("invitable-orders")
    invitable(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "product-review:write");
        authorize(ctx, "order:read");
        return this.reviews.invitableOrders(ctx.organizationId);
    }

    @Get("orders/:orderId")
    invitationState(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
    ) {
        authorize(ctx, "product-review:read");
        authorize(ctx, "order:read");
        return this.reviews.invitationState(ctx.organizationId, orderId);
    }

    @Post("invitations")
    @HttpCode(200)
    invite(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: InviteReviewsDto,
    ) {
        authorize(ctx, "product-review:write");
        authorize(ctx, "order:read");
        return this.reviews.invite(ctx, dto.orderIds);
    }

    @Patch(":reviewId/reply")
    reply(
        @OrgContext() ctx: OrganizationContext,
        @Param("reviewId") reviewId: string,
        @Body() dto: ReplyDto,
    ) {
        authorize(ctx, "product-review:write");
        return this.reviews.reply(ctx, reviewId, dto.reply);
    }

    @Post(":reviewId/hide")
    @HttpCode(200)
    hide(
        @OrgContext() ctx: OrganizationContext,
        @Param("reviewId") reviewId: string,
    ) {
        authorize(ctx, "product-review:write");
        return this.reviews.setHidden(ctx, reviewId, true);
    }

    @Post(":reviewId/unhide")
    @HttpCode(200)
    unhide(
        @OrgContext() ctx: OrganizationContext,
        @Param("reviewId") reviewId: string,
    ) {
        authorize(ctx, "product-review:write");
        return this.reviews.setHidden(ctx, reviewId, false);
    }
}
