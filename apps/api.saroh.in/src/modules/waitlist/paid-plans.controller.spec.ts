jest.mock("@saroh/database", () => ({ prisma: {} }));
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class OrganizationGuard {},
}));

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { PaidPlansInterestController } from "./paid-plans.controller";
import type { WaitlistService } from "./waitlist.service";

describe("PaidPlansInterestController (Tell me when in the app, KTD8)", () => {
    it("uses the session's email and the business's edition, never a body", async () => {
        const tellMeWhen = jest.fn().mockResolvedValue(undefined);
        const controller = new PaidPlansInterestController({
            tellMeWhen,
        } as unknown as WaitlistService);

        await expect(
            controller.tellMeWhen(
                {
                    organizationId: "org_1",
                    edition: "GLOBAL",
                } as unknown as OrganizationContext,
                { id: "u_1", email: "owner@example.test" } as AuthUser,
            ),
        ).resolves.toEqual({ ok: true });

        expect(tellMeWhen).toHaveBeenCalledWith({
            email: "owner@example.test",
            edition: "GLOBAL",
        });
        // The handler takes no body: an email someone posts can't reach it.
        expect(controller.tellMeWhen.length).toBe(2);
    });
});
