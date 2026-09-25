import { ForbiddenException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { allows, authorize } from "../organizations/organization-policy";
import { CANT_CHANGE_TRACKING } from "./stock-words";
import type { BusinessTracking } from "./tracking";
import { businessTracksStock, setBusinessTracking } from "./tracking";

/**
 * The business's Track stock switch (#515). Reading it needs `store:read`;
 * changing it needs `store:write` — never `inventory:write` alone: turning
 * it off stops every product counting, which is how products sell, not a
 * count. The rules are `tracking.ts`'s.
 */
@Injectable()
export class StockTrackingService {
    async get(
        ctx: OrganizationContext,
    ): Promise<{ tracked: boolean; canChange: boolean }> {
        authorize(ctx, "store:read");
        return {
            tracked: await businessTracksStock(prisma, ctx.organizationId),
            canChange: allows(ctx, "store:write"),
        };
    }

    async set(
        ctx: OrganizationContext,
        tracked: boolean,
    ): Promise<BusinessTracking> {
        authorize(ctx, "store:read");
        if (!allows(ctx, "store:write")) {
            throw new ForbiddenException(CANT_CHANGE_TRACKING);
        }
        return prisma.$transaction((tx) =>
            setBusinessTracking(
                tx,
                { organizationId: ctx.organizationId, userId: ctx.userId },
                tracked,
            ),
        );
    }
}
