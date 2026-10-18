/**
 * `GET /billing-profiles` (DEC-167), with no database: the caller's own
 * billing profiles, for setting up a business. Signed in is all it needs
 * (there is no business yet), and the list is asked for by the session's
 * user, never an id the caller sends.
 */
import "reflect-metadata";

// Importing the guard would pull in better-auth's ESM; the route only
// needs to name it.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("@saroh/database", () => ({
    prisma: {},
    currentOrgContext: () => undefined,
    isRlsEnforcementEnabled: () => false,
    outsideOrgContext: (fn: () => unknown) => fn(),
}));

import { RequestMethod } from "@nestjs/common";
import {
    GUARDS_METADATA,
    METHOD_METADATA,
    PATH_METADATA,
} from "@nestjs/common/constants";

import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { BillingProfilesController } from "./billing-profiles.controller";
import type { BillingProfilesService } from "./billing-profiles.service";
import { BusinessBillingProfileController } from "./business-billing-profile.controller";
import type { BusinessBillingProfileService } from "./business-billing-profile.service";

describe("GET /billing-profiles", () => {
    it("is signed-in only, with no business guard", () => {
        expect(
            Reflect.getMetadata(PATH_METADATA, BillingProfilesController),
        ).toBe("billing-profiles");
        expect(
            Reflect.getMetadata(GUARDS_METADATA, BillingProfilesController),
        ).toEqual([BetterAuthGuard]);
        const handler = BillingProfilesController.prototype.listMine;
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
            RequestMethod.GET,
        );
    });

    it("lists the session user's own profiles", async () => {
        const listMine = jest.fn().mockResolvedValue([{ id: "bprof_1" }]);
        const controller = new BillingProfilesController({
            listMine,
        } as unknown as BillingProfilesService);

        await expect(
            controller.listMine({ id: "user_1" } as AuthUser),
        ).resolves.toEqual([{ id: "bprof_1" }]);
        expect(listMine).toHaveBeenCalledWith("user_1");
    });
});

describe("organizations/:organizationId/billing/profile (U5)", () => {
    const ctx = {
        organizationId: "org_1",
        userId: "user_1",
    } as OrganizationContext;

    it("is the business's, behind its guard", () => {
        expect(
            Reflect.getMetadata(
                PATH_METADATA,
                BusinessBillingProfileController,
            ),
        ).toBe("organizations/:organizationId/billing/profile");
        expect(
            Reflect.getMetadata(
                GUARDS_METADATA,
                BusinessBillingProfileController,
            ),
        ).toEqual([BetterAuthGuard, OrganizationGuard]);
        const verbs = (["view", "choose", "create", "update"] as const).map(
            (name) => [
                Reflect.getMetadata(
                    METHOD_METADATA,
                    BusinessBillingProfileController.prototype[name],
                ) as RequestMethod,
                Reflect.getMetadata(
                    PATH_METADATA,
                    BusinessBillingProfileController.prototype[name],
                ) as string,
            ],
        );
        expect(verbs).toEqual([
            [RequestMethod.GET, "/"],
            [RequestMethod.POST, "choose"],
            [RequestMethod.POST, "/"],
            [RequestMethod.PATCH, ":profileId"],
        ]);
    });

    it("passes the business's context on, and `use` only when it is true", async () => {
        const service = {
            view: jest.fn().mockResolvedValue({}),
            choose: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
        };
        const controller = new BusinessBillingProfileController(
            service as unknown as BusinessBillingProfileService,
        );
        await controller.view(ctx);
        expect(service.view).toHaveBeenCalledWith(ctx);
        await controller.choose(ctx, { billingProfileId: "bprof_2" });
        expect(service.choose).toHaveBeenCalledWith(ctx, "bprof_2");
        await controller.create(ctx, {
            legalName: "Asha Foods",
            billingEmail: "a@example.com",
        });
        expect(service.create).toHaveBeenCalledWith(
            ctx,
            { legalName: "Asha Foods", billingEmail: "a@example.com" },
            false,
        );
        await controller.update(ctx, "bprof_2", { city: "Pune" });
        expect(service.update).toHaveBeenCalledWith(ctx, "bprof_2", {
            city: "Pune",
        });
    });
});
