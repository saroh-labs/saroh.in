import {
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { NOT_SOLD_THERE, SOLD_OUT_NEEDS_UNTRACKED } from "../stock/sold-out";
import { tracksStock } from "../stock/tracking";
import type { ProductScope } from "./product-access";
import { ProductAccess } from "./product-access";
import { lockProduct } from "./stock-levels";

/** Where a product was marked, as the product page and editor read it. */
export interface SoldOutView {
    productId: string;
    storefrontId: string;
    /** The storefront's name, for the toast: "Marked sold out at Hill Road." */
    name: string;
    soldOut: boolean;
}

/**
 * Mark an untracked product Sold out at one storefront, or available again
 * (#515, DEC-032 amended). Whoever may count and move stock may do it
 * (`inventory:write`, or `store:write`, which implies it): it says what is
 * on the shelf, not how the product sells. Only for a product that counts no
 * stock — one that counts is Sold out when its count runs out, so asking is
 * a 409. The storefront must sell the product; a product or storefront of
 * another business is not found.
 *
 * Under the product's lock (the lock order's Product step), so it can't
 * cross Track stock turning on — which clears it. Idempotent: marking what
 * is marked changes nothing and records nothing. No stock entry is written;
 * the change goes in the business's audit stream (Settings → Activity).
 */
@Injectable()
export class SoldOutService {
    constructor(
        private readonly access: ProductAccess,
        // Optional so DB specs can construct the service with only what
        // they exercise; the real graph always resolves it.
        @Optional() private readonly audit?: AuditService,
    ) {}

    /** The organization route: `storefrontId` names the storefront. */
    async set(
        ctx: OrganizationContext,
        productId: string,
        storefrontId: string,
        soldOut: boolean,
    ): Promise<SoldOutView> {
        return this.setIn(
            await this.access.stock(ctx, productId, storefrontId),
            productId,
            soldOut,
        );
    }

    /** The storefront-route alias: at `storeId`, where it is listed. */
    async setViaStore(
        storeId: string,
        productId: string,
        userId: string,
        soldOut: boolean,
    ): Promise<SoldOutView> {
        return this.setIn(
            await this.access.stockViaStore(storeId, userId, productId),
            productId,
            soldOut,
        );
    }

    /** The caller has been checked: `scope` may count and move stock. */
    async setIn(
        scope: ProductScope,
        productId: string,
        soldOut: boolean,
    ): Promise<SoldOutView> {
        const { organizationId, storeId, userId } = scope;
        const result = await prisma.$transaction(async (tx) => {
            await lockProduct(tx, productId);
            const product = await tx.product.findFirst({
                where: { id: productId, organizationId },
                select: { name: true },
            });
            if (!product) throw new NotFoundException("Product not found");
            const listing = await tx.productListing.findFirst({
                where: {
                    storeId,
                    productId,
                    organizationId,
                    store: { deletedAt: null },
                },
                select: {
                    id: true,
                    soldOutAt: true,
                    store: { select: { name: true } },
                },
            });
            if (!listing) throw new NotFoundException(NOT_SOLD_THERE);
            if (await tracksStock(tx, productId)) {
                throw new ConflictException({
                    message: SOLD_OUT_NEEDS_UNTRACKED,
                    field: "soldOut",
                });
            }
            const was = listing.soldOutAt !== null;
            if (was !== soldOut) {
                await tx.productListing.update({
                    where: { id: listing.id },
                    data: soldOut
                        ? { soldOutAt: new Date(), soldOutByUserId: userId }
                        : { soldOutAt: null, soldOutByUserId: null },
                });
            }
            return {
                changed: was !== soldOut,
                product: product.name,
                storefront: listing.store.name,
            };
        });
        if (result.changed) {
            await this.audit?.record({
                action: soldOut
                    ? AuditAction.ProductSoldOutMark
                    : AuditAction.ProductSoldOutClear,
                actorUserId: userId,
                organizationId,
                targetType: "product",
                targetId: productId,
                outcome: AuditOutcome.Success,
                metadata: {
                    product: result.product,
                    storefront: result.storefront,
                    storefrontId: storeId,
                },
            });
        }
        return {
            productId,
            storefrontId: storeId,
            name: result.storefront,
            soldOut,
        };
    }
}
