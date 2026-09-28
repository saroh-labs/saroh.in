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
    const controller = new OrganizationOrdersController(
        { listRows } as unknown as OrdersService,
        {} as unknown as OrderKitchenService,
        {} as unknown as OrderPayLinkService,
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
            { money: false, contact: true },
        );
    });

    it.each(["OWNER", "ADMIN"] as const)(
        "lets a %s read them in full",
        async (role) => {
            await controller.list(as(role));
            expect(listRows).toHaveBeenCalledWith(
                "org_1",
                {},
                { money: true, contact: true },
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
                { money: true, contact: true },
            );
        });

        it("answers the same with v=2, which the app still sends", async () => {
            await controller.list(as("OWNER"), { v: "2", storeId: "s1" });
            expect(listRows).toHaveBeenCalledWith(
                "org_1",
                { storeId: "s1" },
                { money: true, contact: true },
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
                { money: true, contact: true },
            );
        });

        it("gives a MEMBER rows without money; contact details follow contact:read", async () => {
            await controller.list(as("MEMBER"), { v: "2", late: "false" });
            expect(listRows).toHaveBeenCalledWith(
                "org_1",
                { late: false },
                { money: false, contact: true },
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
                { money: false, contact: false },
            );
        });

        it("refuses a caller with neither order:read nor order:stage", () => {
            expect(() => controller.list(as("REVIEWER"), { v: "2" })).toThrow(
                ForbiddenException,
            );
            expect(listRows).not.toHaveBeenCalled();
        });
    });
});
