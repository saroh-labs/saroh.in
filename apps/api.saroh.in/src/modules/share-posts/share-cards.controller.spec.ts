/**
 * The booking page's card with the sheet's headline (#1375): only for the
 * business's own people holding `social:read`, and only ever drawn on the
 * business the request's context is, whatever the address says.
 */
// The guards sign people in; here the context is given, so stand them in.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));
jest.mock("./public-share.service", () => ({ PublicShareService: class {} }));

import { ForbiddenException } from "@nestjs/common";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { resolveCapabilities } from "../organizations/organization-policy";
import type { PublicShareService } from "./public-share.service";
import { ShareCardsController } from "./share-cards.controller";

const png = Buffer.from("png");

function setup() {
    const share = {
        bookForOrganization: jest.fn(() => Promise.resolve(png)),
    };
    const controller = new ShareCardsController(
        share as unknown as PublicShareService,
    );
    const res = { setHeader: jest.fn() };
    return { share, controller, res };
}

const person = (role: OrgRole, extras: string[] = []): OrganizationContext =>
    ({
        organizationId: "org_1",
        userId: "user_1",
        role,
        roleKey: role,
        actions: resolveCapabilities(role, null, extras),
    }) as OrganizationContext;

describe("organizations/:id/share/book/image", () => {
    it("draws for an Owner or Admin, on their own business, never stored", async () => {
        for (const role of ["OWNER", "ADMIN"] as const) {
            const { share, controller, res } = setup();
            const file = await controller.book(
                person(role),
                {
                    headline: "Cake consults",
                    organizationId: "org_other",
                } as never,
                res as never,
            );
            expect(share.bookForOrganization).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({ headline: "Cake consults" }),
                "share-org:user_1",
            );
            expect(file.getHeaders().type).toBe("image/png");
            expect(res.setHeader).toHaveBeenCalledWith(
                "Cache-Control",
                "private, no-store",
            );
        }
    });

    it("refuses anyone without social:read, and lets a Member given it", async () => {
        for (const ctx of [person("MEMBER"), person("REVIEWER")]) {
            const { share, controller, res } = setup();
            await expect(
                controller.book(ctx, { headline: "x" }, res as never),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(share.bookForOrganization).not.toHaveBeenCalled();
        }
        const { share, controller, res } = setup();
        await controller.book(
            person("MEMBER", ["social:read"]),
            {},
            res as never,
        );
        expect(share.bookForOrganization).toHaveBeenCalled();
    });
});
