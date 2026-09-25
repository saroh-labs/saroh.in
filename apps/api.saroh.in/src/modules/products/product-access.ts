import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { OrgAction } from "../organizations/organization-actions";
import { allows, authorize } from "../organizations/organization-policy";
import { StoresService } from "../stores/stores.service";

/**
 * Whose catalogue a request works on, at which storefront, and what the
 * caller may do there (#531).
 *
 * The catalogue belongs to the business; `storeId` is the storefront whose
 * shelf and listing the request reads or writes — the one the screen is
 * open at. Every products service takes a scope, so the organization routes
 * and the old storefront routes run the same code.
 */
export interface ProductScope {
    organizationId: string;
    /** The storefront whose shelf and listing are read or written. */
    storeId: string;
    /** The caller may change products (`store:write`). */
    canWrite: boolean;
    /** Whether the caller holds `action` — the product page's panels. */
    may(action: OrgAction): Promise<boolean>;
}

/** A missing storefront query picks one, or refuses when that would guess. */
type WhenUnnamed = "first" | "refuse";

/**
 * Who may read and change the business's products (#531), mirroring
 * `CatalogueAccess` (#529).
 *
 * Organization routes: the guard has proved membership; the role must read
 * the storefronts (`store:read`) or change them (`store:write`). The product
 * must be the business's, and a storefront named in `?storefront=` must be
 * one of its open storefronts — anything else is not found.
 *
 * The old `stores/:storeId/products/...` routes stay for one release as
 * aliases: they resolve the storefront's business under the storefront's own
 * access rules (the same `store:read` / `store:write`, with the legacy owner
 * and member fallback) and require the product to be listed at `:storeId`,
 * so a product of another business — never listed there — is not found.
 * A refusal on an alias is "not found", as it always was there.
 */
@Injectable()
export class ProductAccess {
    constructor(private readonly stores: StoresService) {}

    /** The business, for a caller who can read its products. */
    business(ctx: OrganizationContext): {
        organizationId: string;
        canWrite: boolean;
    } {
        authorize(ctx, "store:read");
        return {
            organizationId: ctx.organizationId,
            canWrite: allows(ctx, "store:write"),
        };
    }

    /** The business, for a caller who can change its products. */
    writeBusiness(ctx: OrganizationContext): string {
        authorize(ctx, "store:read");
        if (!allows(ctx, "store:write")) {
            throw new ForbiddenException("Your role can't change products.");
        }
        return ctx.organizationId;
    }

    /** Read one product (or the business's products) at a storefront. */
    async read(
        ctx: OrganizationContext,
        productId?: string,
        storefront?: string,
    ): Promise<ProductScope> {
        const { organizationId, canWrite } = this.business(ctx);
        return {
            organizationId,
            storeId: await this.storefrontFor(
                organizationId,
                productId,
                storefront,
                "first",
            ),
            canWrite,
            may: (action) => Promise.resolve(allows(ctx, action)),
        };
    }

    /**
     * Change one product, or make one (no `productId`). A new product needs
     * a storefront to be sold at: named, or the business's only one.
     */
    async write(
        ctx: OrganizationContext,
        productId?: string,
        storefront?: string,
    ): Promise<ProductScope> {
        const organizationId = this.writeBusiness(ctx);
        return {
            organizationId,
            storeId: await this.storefrontFor(
                organizationId,
                productId,
                storefront,
                productId ? "first" : "refuse",
            ),
            canWrite: true,
            may: (action) => Promise.resolve(allows(ctx, action)),
        };
    }

    /** Store-route alias: read at `storeId`, where the product is listed. */
    async readViaStore(
        storeId: string,
        userId: string,
        productId?: string,
    ): Promise<ProductScope> {
        const store = await this.stores.getForUser(storeId, userId);
        if (productId) await this.assertListed(storeId, productId);
        return {
            organizationId: store.organizationId,
            storeId,
            canWrite: await this.stores.canWrite(storeId, userId),
            may: (action) => this.stores.memberAllows(storeId, userId, action),
        };
    }

    /** Store-route alias: change at `storeId`, where the product is listed. */
    async writeViaStore(
        storeId: string,
        userId: string,
        productId?: string,
    ): Promise<ProductScope> {
        const writable = await this.stores.writableOrganization(
            storeId,
            userId,
        );
        // Every storefront belongs to a business (Store.organizationId is
        // required); a product must carry it (#510).
        if (!writable?.organizationId) {
            throw new NotFoundException("Store not found");
        }
        if (productId) await this.assertListed(storeId, productId);
        return {
            organizationId: writable.organizationId,
            storeId,
            canWrite: true,
            may: (action) => this.stores.memberAllows(storeId, userId, action),
        };
    }

    /**
     * The storefront a request on the organization route is at: the one
     * named (an open storefront of the business), else the first that sells
     * the product, else the business's first — or, for a new product with
     * several to choose from, a question back.
     */
    private async storefrontFor(
        organizationId: string,
        productId: string | undefined,
        storefront: string | undefined,
        whenUnnamed: WhenUnnamed,
    ): Promise<string> {
        if (productId) {
            const product = await prisma.product.findFirst({
                where: { id: productId, organizationId },
                select: { id: true },
            });
            if (!product) throw new NotFoundException("Product not found");
        }
        if (storefront) {
            const store = await prisma.store.findFirst({
                where: { id: storefront, organizationId, deletedAt: null },
                select: { id: true },
            });
            if (!store) throw new NotFoundException("Store not found");
            return store.id;
        }
        if (productId) {
            const listing = await prisma.productListing.findFirst({
                where: {
                    productId,
                    organizationId,
                    store: { deletedAt: null },
                },
                orderBy: [{ store: { createdAt: "asc" } }, { storeId: "asc" }],
                select: { storeId: true },
            });
            if (listing) return listing.storeId;
        }
        const open = await prisma.store.findMany({
            where: { organizationId, deletedAt: null },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true },
            take: 2,
        });
        const first = open[0];
        if (!first) {
            throw new NotFoundException("This business has no storefront yet.");
        }
        if (whenUnnamed === "refuse" && open.length > 1) {
            throw new BadRequestException({
                message: "Pick the storefront that sells it.",
                field: "storefront",
            });
        }
        return first.id;
    }

    private async assertListed(
        storeId: string,
        productId: string,
    ): Promise<void> {
        const listed = await prisma.productListing.findUnique({
            where: { storeId_productId: { storeId, productId } },
            select: { id: true },
        });
        if (!listed) throw new NotFoundException("Product not found");
    }
}
