import { ForbiddenException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    allows,
    authorize,
    canWriteStock,
} from "../organizations/organization-policy";
import type { StockActor } from "./stock.service";

/**
 * Who may read and change stock (#514), per the plan's permission table:
 *
 * | Read levels, the log, the checks                    | `store:read`                      |
 * | People's names on the log                           | `audit:read`                      |
 * | Links to orders on the log and checks               | `order:read`                      |
 * | Count, add, record, move, undo, resolve a check     | `canWriteStock` (inventory:write, |
 * |                                                     | or store:write, which implies it) |
 *
 * The business is always the one the organization guard proved; every id a
 * request names is looked up inside it, so one from another business is not
 * found.
 */

export interface StockReader {
    organizationId: string;
    /** May count and move stock — the screen shows its buttons. */
    canWrite: boolean;
    /** May see who made each change. */
    seesPeople: boolean;
    /** May open the orders a change or a check is about. */
    seesOrders: boolean;
}

export function stockReader(ctx: OrganizationContext): StockReader {
    authorize(ctx, "store:read");
    return {
        organizationId: ctx.organizationId,
        canWrite: canWriteStock(ctx),
        seesPeople: allows(ctx, "audit:read"),
        seesOrders: allows(ctx, "order:read"),
    };
}

export const CANT_WRITE_STOCK = "Your role can't count or move stock.";

/** The person changing stock, for a caller who may. */
export function stockWriter(ctx: OrganizationContext): StockActor {
    authorize(ctx, "store:read");
    if (!canWriteStock(ctx)) throw new ForbiddenException(CANT_WRITE_STOCK);
    return {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        roleKey: ctx.roleKey,
    };
}
