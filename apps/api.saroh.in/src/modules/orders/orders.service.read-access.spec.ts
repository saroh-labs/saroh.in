// Who may read a storefront's orders through the store-scoped routes (U14).
//
// Commerce opened to `order:stage` so a Member at the counter can reach Sell
// (DEC-024). This older read sends every order's totals, so it must refuse
// the kitchen's roles — `order:stage` without `order:read` — and a storefront
// role alone (DEC-106), while everyone who reaches it through their business
// role, and a legacy storefront owner, is unchanged.
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

    it("leaves a role that reaches the storefront through the business as it was", async () => {
        const orders = service(["store:read"]);
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
