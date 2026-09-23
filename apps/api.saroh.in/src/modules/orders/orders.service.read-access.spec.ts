// Who may read a storefront's orders through the store-scoped routes (U14).
//
// Commerce opened to `order:stage` so a Member at the counter can reach Sell
// (DEC-024). This older read sends every order's totals, so it must refuse
// the kitchen's roles — `order:stage` without `order:read` — while everyone
// who reached it before, and a legacy store grant, is unchanged.
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

function service(allowed: string[]) {
    const stores = {
        getForUser: jest.fn().mockResolvedValue({ id: "store_1" }),
        memberAllows: jest.fn((_s: string, _u: string, action: string) =>
            Promise.resolve(allowed.includes(action)),
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

    it("leaves a legacy store grant, with no membership, as it was", async () => {
        const orders = service([]);
        await expect(orders.list("store_1", "user_1")).resolves.toEqual([]);
    });
});
