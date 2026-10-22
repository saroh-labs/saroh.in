// Who may read a storefront's orders through the store-scoped routes (U14).
//
// Commerce opened to `order:stage` so a Member at the counter can reach Sell
// (DEC-024). This older read sends every order's totals, so it must refuse
// the kitchen's roles — `order:stage` without `order:read` — a storefront
// role alone (DEC-106), and store access alone (#868): amounts take a money
// permission, never `store:read`. A role that reads orders, and a legacy
// storefront owner, read as before.
jest.mock("@saroh/database", () => ({
    prisma: {
        order: {
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn().mockResolvedValue(null),
        },
    },
}));

import { ForbiddenException, NotFoundException } from "@nestjs/common";

import type { StoresService } from "../stores/stores.service";
import { OrdersService } from "./orders.service";

/**
 * `allowed`: what the business role permits. `owner`: the storefront's owner
 * on the older per-store path, the one way in `moneyAllows` adds to it.
 */
function service(allowed: string[], { owner = false } = {}) {
    const stores = {
        getForUser: jest.fn().mockResolvedValue({ id: "store_1" }),
        memberAllows: jest.fn((_s: string, _u: string, action: string) =>
            Promise.resolve(allowed.includes(action)),
        ),
        moneyAllows: jest.fn((_s: string, _u: string, action: string) =>
            Promise.resolve(owner || allowed.includes(action)),
        ),
    } as unknown as StoresService;
    return new OrdersService(stores);
}

describe("OrdersService store-scoped reads", () => {
    it("refuses a Member, who moves stages but reads no money", async () => {
        const orders = service(["order:stage", "store:read"]);
        await expect(orders.list("store_1", "user_1")).rejects.toThrow(
            ForbiddenException,
        );
        await expect(
            orders.get("store_1", "order_1", "user_1"),
        ).rejects.toThrow(ForbiddenException);
    });

    it("lets a role that reads orders in", async () => {
        const orders = service(["order:read", "order:stage"]);
        await expect(orders.list("store_1", "user_1")).resolves.toEqual([]);
        // Past the check: an unknown order is a 404, not a refusal.
        await expect(
            orders.get("store_1", "order_1", "user_1"),
        ).rejects.toThrow(NotFoundException);
    });

    it("refuses a business role with store access but no order read (#868)", async () => {
        // "See locations" alone: the storefront, not what it has sold.
        const orders = service(["store:read", "contact:read"]);
        await expect(orders.list("store_1", "user_1")).rejects.toThrow(
            ForbiddenException,
        );
        await expect(
            orders.get("store_1", "order_1", "user_1"),
        ).rejects.toThrow(ForbiddenException);
    });

    it("lets a business role that reads orders in, store access or not", async () => {
        const orders = service(["store:read", "order:read"]);
        await expect(orders.list("store_1", "user_1")).resolves.toEqual([]);
    });

    it("leaves a legacy storefront owner, with no membership, as it was", async () => {
        const orders = service([], { owner: true });
        await expect(orders.list("store_1", "user_1")).resolves.toEqual([]);
    });

    it("refuses a storefront role alone: no amounts by its name (DEC-106)", async () => {
        // A storefront Manager whose business role reads no orders.
        const orders = service([]);
        await expect(orders.list("store_1", "user_1")).rejects.toThrow(
            ForbiddenException,
        );
        await expect(
            orders.get("store_1", "order_1", "user_1"),
        ).rejects.toThrow(ForbiddenException);
    });
});
