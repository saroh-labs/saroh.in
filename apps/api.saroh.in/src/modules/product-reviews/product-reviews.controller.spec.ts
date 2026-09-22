jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));
jest.mock("../../common/email", () => ({
    sendReviewInvitationEmail: jest.fn(),
}));
jest.mock("../../env", () => ({ env: { NODE_ENV: "test" } }));

import { ForbiddenException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { resolveCapabilities } from "../organizations/organization-policy";
import { ProductReviewsController } from "./product-reviews.controller";
import type { ProductReviewsService } from "./product-reviews.service";

describe("ProductReviewsController authorization", () => {
    const service = {
        list: jest.fn(),
        summary: jest.fn(),
        invitableOrders: jest.fn(),
        invitationState: jest.fn(),
        invite: jest.fn(),
        reply: jest.fn(),
        setHidden: jest.fn(),
    };
    const controller = new ProductReviewsController(
        service as unknown as ProductReviewsService,
    );
    const as = (
        role: OrganizationContext["role"],
        over: Partial<OrganizationContext> = {},
    ): OrganizationContext => ({
        organizationId: "org_1",
        userId: "u_1",
        role,
        ...over,
    });

    beforeEach(() => Object.values(service).forEach((m) => m.mockClear()));

    it("lets a Member read reviews but reply to, hide and invite nothing", () => {
        void controller.list(as("MEMBER"));
        expect(service.list).toHaveBeenCalled();
        expect(() =>
            controller.reply(as("MEMBER"), "r_1", { reply: "x" }),
        ).toThrow(ForbiddenException);
        expect(() => controller.hide(as("MEMBER"), "r_1")).toThrow(
            ForbiddenException,
        );
        expect(() =>
            controller.invite(as("MEMBER"), { orderIds: ["o_1"] }),
        ).toThrow(ForbiddenException);
    });

    it("gives a Reviewer — site review, not product review — nothing", () => {
        expect(() => controller.list(as("REVIEWER"))).toThrow(
            ForbiddenException,
        );
        expect(service.list).not.toHaveBeenCalled();
    });

    it("lets an Admin reply, hide and invite", () => {
        void controller.reply(as("ADMIN"), "r_1", { reply: "Thanks" });
        void controller.hide(as("ADMIN"), "r_1");
        void controller.invite(as("ADMIN"), { orderIds: ["o_1"] });
        expect(service.reply).toHaveBeenCalled();
        expect(service.setHidden).toHaveBeenCalledWith(
            expect.anything(),
            "r_1",
            true,
        );
        expect(service.invite).toHaveBeenCalled();
    });

    it("requires orders as well to invite — an invitation is sent from an order", () => {
        const writer = as("MEMBER", {
            roleKey: "reviews-only",
            actions: resolveCapabilities("reviews-only", [
                "product-review:read",
                "product-review:write",
            ]),
        });
        void controller.reply(writer, "r_1", { reply: "ok" });
        expect(service.reply).toHaveBeenCalled();
        expect(() => controller.invite(writer, { orderIds: ["o_1"] })).toThrow(
            ForbiddenException,
        );
    });
});
