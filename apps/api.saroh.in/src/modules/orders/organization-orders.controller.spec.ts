// The guards pull in Better Auth, which Jest cannot parse; this spec is about
// the policy check the controller makes itself, so they are stood in for, the
// same way `capabilities.controller.spec.ts` does it.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));

import { ForbiddenException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { resolveCapabilities } from "../organizations/organization-policy";
import type { OrderCancelService } from "./order-cancel.service";
import type { OrderFulfilmentChangeService } from "./order-fulfilment-change.service";
import type { OrderKitchenService } from "./order-kitchen.service";
import type { OrderPayLinkService } from "./order-pay-link.service";
import type { OrdersService } from "./orders.service";
import { OrganizationOrdersController } from "./organization-orders.controller";

/**
 * Who may list every order in the business.
 *
 * Exists because the first version did not ask: the org and module guards
 * passed, and a Reviewer — website-only, the narrowest role there is — got
 * every order, with customer names, emails and totals.
 */
describe("OrganizationOrdersController", () => {
    const listRows = jest.fn().mockResolvedValue({
        rows: [],
        counts: { all: 0, open: 0, refunded: 0 },
        nextCursor: null,
    });
    const filterOptions = jest
        .fn()
        .mockResolvedValue({ types: [], steps: [], product: null });
    const searchProducts = jest.fn().mockResolvedValue({ products: [] });
    const readOrder = jest.fn();
    const changeFulfilment = jest.fn().mockResolvedValue({ id: "ord_1" });
    const cancelOrder = jest.fn().mockResolvedValue({ id: "ord_1" });
    const controller = new OrganizationOrdersController(
        {
            listRows,
            filterOptions,
            searchProducts,
        } as unknown as OrdersService,
        { read: readOrder } as unknown as OrderKitchenService,
        {} as unknown as OrderPayLinkService,
        { change: changeFulfilment } as unknown as OrderFulfilmentChangeService,
        { cancel: cancelOrder } as unknown as OrderCancelService,
    );

    const as = (
        role: OrganizationContext["role"],
        over: Partial<OrganizationContext> = {},
    ): OrganizationContext => ({
        organizationId: "org_1",
        userId: "user_1",
        role,
        ...over,
    });

    beforeEach(() => {
        listRows.mockClear();
    });

    it("refuses a REVIEWER, who cannot read orders", () => {
        expect(() => controller.list(as("REVIEWER"))).toThrow(
            ForbiddenException,
        );
        expect(listRows).not.toHaveBeenCalled();
    });

    it("gives a MEMBER, who moves kitchen stages, the kitchen's view", async () => {
        await controller.list(as("MEMBER"));
        expect(listRows).toHaveBeenCalledWith(
            "org_1",
            {},
            expect.objectContaining({
                money: false,
                contact: true,
                viewer: expect.anything(),
            }),
        );
    });

    it.each(["OWNER", "ADMIN"] as const)(
        "lets a %s read them in full",
        async (role) => {
            await controller.list(as(role));
            expect(listRows).toHaveBeenCalledWith(
                "org_1",
                {},
                expect.objectContaining({
                    money: true,
                    contact: true,
                    viewer: expect.anything(),
                }),
            );
        },
    );

    it("follows an invented role's own permissions", async () => {
        const clerk = as("MEMBER", {
            roleKey: "stock-clerk",
            actions: resolveCapabilities("stock-clerk", ["order:read"]),
        });
        await controller.list(clerk);
        expect(listRows).toHaveBeenCalled();

        const tidier = as("MEMBER", {
            roleKey: "shelf-tidier",
            actions: resolveCapabilities("shelf-tidier", ["store:read"]),
        });
        expect(() => controller.list(tidier)).toThrow(ForbiddenException);
    });

    describe("Export (B16): order:export", () => {
        const custom = (actions: string[]) =>
            as("MEMBER", {
                roleKey: "custom",
                actions: resolveCapabilities("custom", actions),
            });

        it("refuses an export page to a role that only reads orders", () => {
            expect(() =>
                controller.list(custom(["order:read"]), { export: "true" }),
            ).toThrow(ForbiddenException);
            expect(listRows).not.toHaveBeenCalled();
        });

        it("still lists for that role without the export flag", async () => {
            await controller.list(custom(["order:read"]));
            expect(listRows).toHaveBeenCalled();
        });

        it("answers an export page to order:export, or a role saved with order:write", async () => {
            for (const actions of [["order:export"], ["order:write"]]) {
                listRows.mockClear();
                await controller.list(custom(actions), { export: "true" });
                // The flag is the export's own, never a filter.
                expect(listRows).toHaveBeenCalledWith(
                    "org_1",
                    {},
                    expect.objectContaining({ money: true }),
                );
            }
        });

        it("lets an Owner export; refuses the kitchen's Member", async () => {
            await controller.list(as("OWNER"), { export: "true" });
            expect(listRows).toHaveBeenCalled();
            expect(() =>
                controller.list(as("MEMBER"), { export: "true" }),
            ).toThrow(ForbiddenException);
        });
    });

    describe("rows, counts and a cursor (plan B, B1)", () => {
        it("answers the paged rows without v=2 too: the bare array is gone (B2d)", async () => {
            const page = await controller.list(as("OWNER"), {
                storeId: "s1",
                q: "x",
            });
            expect(page).toEqual({
                rows: [],
                counts: { all: 0, open: 0, refunded: 0 },
                nextCursor: null,
            });
            expect(listRows).toHaveBeenCalledWith(
                "org_1",
                { storeId: "s1", q: "x" },
                expect.objectContaining({
                    money: true,
                    contact: true,
                    viewer: expect.anything(),
                }),
            );
        });

        it("answers the same with v=2, which the app still sends", async () => {
            await controller.list(as("OWNER"), { v: "2", storeId: "s1" });
            expect(listRows).toHaveBeenCalledWith(
                "org_1",
                { storeId: "s1" },
                expect.objectContaining({
                    money: true,
                    contact: true,
                    viewer: expect.anything(),
                }),
            );
        });

        it("gives an OWNER rows with money and contact details", async () => {
            await controller.list(as("OWNER"), {
                v: "2",
                tab: "open",
                late: "true",
                stage: ["READY"],
            });
            expect(listRows).toHaveBeenCalledWith(
                "org_1",
                { tab: "open", late: true, stage: ["READY"] },
                expect.objectContaining({
                    money: true,
                    contact: true,
                    viewer: expect.anything(),
                }),
            );
        });

        it("gives a MEMBER rows without money; contact details follow contact:read", async () => {
            await controller.list(as("MEMBER"), { v: "2", late: "false" });
            expect(listRows).toHaveBeenCalledWith(
                "org_1",
                { late: false },
                expect.objectContaining({
                    money: false,
                    contact: true,
                    viewer: expect.anything(),
                }),
            );
        });

        it("keeps phone and email from a kitchen role without contact:read", async () => {
            const counter = as("MEMBER", {
                roleKey: "counter",
                actions: resolveCapabilities("counter", ["order:stage"]),
            });
            await controller.list(counter, { v: "2" });
            expect(listRows).toHaveBeenCalledWith(
                "org_1",
                { late: undefined },
                expect.objectContaining({
                    money: false,
                    contact: false,
                    viewer: expect.anything(),
                }),
            );
        });

        it("refuses a caller with neither order:read nor order:stage", () => {
            expect(() => controller.list(as("REVIEWER"), { v: "2" })).toThrow(
                ForbiddenException,
            );
            expect(listRows).not.toHaveBeenCalled();
        });

        it("passes B4's step and date preset through", async () => {
            await controller.list(as("OWNER"), {
                v: "2",
                step: "handed-to-courier",
                date: "7d",
            });
            expect(listRows).toHaveBeenCalledWith(
                "org_1",
                { step: "handed-to-courier", date: "7d", late: undefined },
                expect.objectContaining({
                    money: true,
                    contact: true,
                    viewer: expect.anything(),
                }),
            );
        });

        it("passes Needs attention through as a boolean, with the caller (B15)", async () => {
            const ctx = as("MEMBER");
            await controller.list(ctx, { v: "2", attention: "true" });
            expect(listRows).toHaveBeenLastCalledWith(
                "org_1",
                expect.objectContaining({ attention: true }),
                expect.objectContaining({ viewer: ctx }),
            );
            await controller.list(ctx, { v: "2", attention: "false" });
            expect(listRows).toHaveBeenLastCalledWith(
                "org_1",
                expect.objectContaining({ attention: false }),
                expect.anything(),
            );
        });
    });

    describe("the filter bar's options (B4)", () => {
        const counter = () =>
            as("MEMBER", {
                roleKey: "counter",
                actions: resolveCapabilities("counter", ["order:stage"]),
            });

        beforeEach(() => {
            filterOptions.mockClear();
            searchProducts.mockClear();
        });

        it("answers whoever may list orders, the kitchen included", async () => {
            await controller.filters(as("OWNER"), { productId: "p1" });
            expect(filterOptions).toHaveBeenCalledWith("org_1", "p1");
            await controller.products(counter(), { q: "sour" });
            expect(searchProducts).toHaveBeenCalledWith("org_1", "sour");
        });

        it("refuses a caller with neither order:read nor order:stage", () => {
            expect(() => controller.filters(as("REVIEWER"))).toThrow(
                ForbiddenException,
            );
            expect(() => controller.products(as("REVIEWER"))).toThrow(
                ForbiddenException,
            );
            expect(filterOptions).not.toHaveBeenCalled();
            expect(searchProducts).not.toHaveBeenCalled();
        });
    });

    describe("the quick view's read (B5)", () => {
        const order = {
            id: "o1",
            customer: {
                id: "c1",
                name: "Asha Rao",
                phone: "+91 98765 43210",
                email: "asha@example.in",
                contactId: null,
                orderCount: 1,
                firstOrderAt: null,
            },
        };

        beforeEach(() => {
            readOrder.mockReset();
            readOrder.mockResolvedValue(order);
        });

        it("is Order Detail's read, whole, without ?view=quick", async () => {
            const counter = as("MEMBER", {
                roleKey: "counter",
                actions: resolveCapabilities("counter", ["order:stage"]),
            });
            await expect(controller.read(counter, "o1")).resolves.toBe(order);
            expect(readOrder).toHaveBeenCalledWith(counter, "o1");
        });

        it("keeps the customer's phone and email for a role that reads contacts", async () => {
            const read = await controller.read(as("OWNER"), "o1", "quick");
            expect(read.customer).toMatchObject({
                phone: "+91 98765 43210",
                email: "asha@example.in",
            });
        });

        it("leaves them out for one that doesn't", async () => {
            const counter = as("MEMBER", {
                roleKey: "counter",
                actions: resolveCapabilities("counter", ["order:stage"]),
            });
            const read = await controller.read(counter, "o1", "quick");
            expect(read.customer?.phone).toBeNull();
            expect(read.customer).not.toHaveProperty("email");
        });
    });

    describe("B9: change how it's fulfilled, and cancel", () => {
        it("hands the change to its service with the caller and the body", async () => {
            const owner = as("OWNER");
            const dto = {
                fulfilment: "LOCAL_DELIVERY" as const,
                shipping: "40",
            };
            await controller.changeFulfilment(owner, "o1", dto);
            expect(changeFulfilment).toHaveBeenCalledWith(owner, "o1", dto);
        });

        it("hands the cancel to its service with the caller and the body", async () => {
            const owner = as("OWNER");
            const dto = { reason: "Late", idempotencyKey: "k1" };
            await controller.cancel(owner, "o1", dto);
            expect(cancelOrder).toHaveBeenCalledWith(owner, "o1", dto);
        });
    });
});
