import {
    BadRequestException,
    ForbiddenException,
    Injectable,
} from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { allows, authorize } from "../organizations/organization-policy";
import { StoresService } from "../stores/stores.service";

/** The business whose catalogue settings a request reads, and whether it may change them. */
export interface CatalogueScope {
    organizationId: string;
    canWrite: boolean;
}

/**
 * Who may read and change the business's catalogue settings (#529):
 * categories, options, custom fields, allergens, the SKU pattern and the
 * defaults. They belong to the business, so every service takes an
 * organization id; this is the one place that id comes from.
 *
 * Organization routes: the guard has proved membership, and the role must
 * read the storefronts (`store:read`) or change them (`store:write`).
 *
 * The old `stores/:storeId/...` routes stay for one release as aliases: they
 * resolve the storefront's business under the storefront's own access rules
 * (the same `store:read` / `store:write`, with the legacy owner and member
 * fallback) and call the same organization-scoped services.
 */
@Injectable()
export class CatalogueAccess {
    constructor(private readonly stores: StoresService) {}

    read(ctx: OrganizationContext): CatalogueScope {
        authorize(ctx, "store:read");
        return {
            organizationId: ctx.organizationId,
            canWrite: allows(ctx, "store:write"),
        };
    }

    write(ctx: OrganizationContext): string {
        if (!allows(ctx, "store:write")) {
            throw new ForbiddenException(
                "Your role can't change product settings.",
            );
        }
        return ctx.organizationId;
    }

    /** A storefront's business, for someone who can open the storefront; 404 otherwise. */
    async readViaStore(
        storeId: string,
        userId: string,
    ): Promise<CatalogueScope> {
        const store = await this.stores.getForUser(storeId, userId);
        return {
            organizationId: store.organizationId,
            canWrite: await this.stores.canWrite(storeId, userId),
        };
    }

    /**
     * A storefront's business, for someone who can change the storefront.
     * One they can open but not change is told so; one they can't open is
     * not found.
     */
    async writeViaStore(storeId: string, userId: string): Promise<string> {
        const writable = await this.stores.writableOrganization(
            storeId,
            userId,
        );
        if (!writable) {
            await this.stores.getForUser(storeId, userId);
            throw new ForbiddenException(
                "Your role can't change product settings.",
            );
        }
        if (!writable.organizationId) {
            throw new BadRequestException(
                "This storefront belongs to no business.",
            );
        }
        return writable.organizationId;
    }
}

/** A query's category id; blank means none (All products). */
export function blankToNull(categoryId?: string): string | null {
    return categoryId?.trim() ? categoryId : null;
}
