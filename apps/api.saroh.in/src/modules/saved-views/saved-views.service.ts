import { Injectable, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";

/** The JSON input type the Prisma client expects for SavedView.filters. */
type SavedViewFilters = NonNullable<
    Parameters<typeof prisma.savedView.create>[0]["data"]
>["filters"];

/**
 * Saved list views (#124). Per-actor, per-resource named filter sets. A view is
 * scoped to BOTH the Organization and the owner who created it — you only ever
 * see or delete your own. `filters` is the shareable URL query contract (plain
 * JSON), never raw SQL, so a saved view can never smuggle an unsafe query.
 */
export interface SavedViewInput {
    resource: string;
    name: string;
    filters: Record<string, unknown>;
}

/** A stored saved view, in a portable shape (Prisma's inferred type is not). */
export interface SavedViewRecord {
    id: string;
    organizationId: string;
    ownerUserId: string;
    resource: string;
    name: string;
    filters: unknown;
    createdAt: Date;
    updatedAt: Date;
}

@Injectable()
export class SavedViewsService {
    constructor(@Optional() private readonly db: typeof prisma = prisma) {}

    list(
        ctx: OrganizationContext,
        resource: string,
    ): Promise<SavedViewRecord[]> {
        return this.db.savedView.findMany({
            where: {
                organizationId: ctx.organizationId,
                ownerUserId: ctx.userId,
                resource,
            },
            orderBy: { createdAt: "asc" },
        });
    }

    create(
        ctx: OrganizationContext,
        input: SavedViewInput,
    ): Promise<SavedViewRecord> {
        return this.db.savedView.create({
            data: {
                organizationId: ctx.organizationId,
                ownerUserId: ctx.userId,
                resource: input.resource,
                name: input.name,
                // Plain JSON URL-filter contract — never SQL.
                filters: input.filters as SavedViewFilters,
            },
        });
    }

    /** Delete only the caller's own view (org + owner scoped). */
    async remove(ctx: OrganizationContext, id: string): Promise<void> {
        await this.db.savedView.deleteMany({
            where: {
                id,
                organizationId: ctx.organizationId,
                ownerUserId: ctx.userId,
            },
        });
    }
}
