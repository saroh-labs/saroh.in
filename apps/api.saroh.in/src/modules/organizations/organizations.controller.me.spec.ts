import { NotFoundException } from "@nestjs/common";

jest.mock("@saroh/database", () => ({ prisma: {} }));
// Importing the guards would pull in better-auth's ESM; the route only
// needs to name them.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class OrganizationGuard {},
}));

import type { OrganizationContext } from "../../common/types/organization-context";
import type { OrganizationContextService } from "./organization-context.service";
import { OrganizationsController } from "./organizations.controller";

/** `GET /organizations/:id/me`: the caller's own row, never another's. */
describe("OrganizationsController.me", () => {
    const listForUser = jest.fn();
    const controller = new OrganizationsController(
        { listForUser } as unknown as OrganizationContextService,
        {} as never,
        {} as never,
    );
    const ctx = {
        organizationId: "org_1",
        userId: "user_1",
        role: "MEMBER",
    } as OrganizationContext;

    beforeEach(() => listForUser.mockReset());

    it("reads the guard's user and business, not anything the request names", async () => {
        listForUser.mockResolvedValue([{ id: "org_1", role: "MEMBER" }]);
        await expect(controller.me(ctx)).resolves.toEqual({
            id: "org_1",
            role: "MEMBER",
        });
        expect(listForUser).toHaveBeenCalledWith("user_1", "org_1");
    });

    it("is a 404 when the business closed after the guard", async () => {
        listForUser.mockResolvedValue([]);
        await expect(controller.me(ctx)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
