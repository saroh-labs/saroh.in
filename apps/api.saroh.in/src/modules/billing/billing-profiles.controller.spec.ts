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
import type { BillingProfilesAccountService } from "./billing-profiles-account.service";
import { BillingProfilesController } from "./billing-profiles.controller";
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
        const list = jest.fn().mockResolvedValue([{ id: "bprof_1" }]);
        const controller = new BillingProfilesController({
            list,
        } as unknown as BillingProfilesAccountService);

        await expect(
            controller.listMine({ id: "user_1" } as AuthUser),
        ).resolves.toEqual([{ id: "bprof_1" }]);
        expect(list).toHaveBeenCalledWith("user_1");
    });
});

describe("billing-profiles at the account level (step 2, #1015)", () => {
    const user = { id: "user_1" } as AuthUser;

    it("has every route, each asked for by the session's user", async () => {
        const verbs = (
            [
                "listMine",
                "businesses",
                "detail",
                "create",
                "update",
                "move",
                "cancelPending",
                "remove",
                "sync",
            ] as const
        ).map((name) => [
            Reflect.getMetadata(
                METHOD_METADATA,
                BillingProfilesController.prototype[name],
            ) as RequestMethod,
            Reflect.getMetadata(
                PATH_METADATA,
                BillingProfilesController.prototype[name],
            ) as string,
        ]);
        expect(verbs).toEqual([
            [RequestMethod.GET, "/"],
            [RequestMethod.GET, "businesses"],
            [RequestMethod.GET, ":id"],
            [RequestMethod.POST, "/"],
            [RequestMethod.PATCH, ":id"],
            [RequestMethod.POST, ":id/businesses/:organizationId"],
            [RequestMethod.DELETE, ":id/businesses/:organizationId/pending"],
            [RequestMethod.DELETE, ":id"],
            [RequestMethod.POST, ":id/sync"],
        ]);

        const service = {
            ownedBusinesses: jest.fn().mockResolvedValue([]),
            detail: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
            move: jest.fn().mockResolvedValue({}),
            cancelPending: jest.fn().mockResolvedValue({}),
            remove: jest.fn().mockResolvedValue({}),
            retrySync: jest.fn().mockResolvedValue({}),
        };
        const controller = new BillingProfilesController(
            service as unknown as BillingProfilesAccountService,
        );
        await controller.businesses(user);
        expect(service.ownedBusinesses).toHaveBeenCalledWith("user_1");
        await controller.detail(user, "bprof_1");
        expect(service.detail).toHaveBeenLastCalledWith(
            "user_1",
            "bprof_1",
            false,
        );
        await controller.detail(user, "bprof_1", "all");
        expect(service.detail).toHaveBeenLastCalledWith(
            "user_1",
            "bprof_1",
            true,
        );
        await controller.create(user, {
            legalName: "Asha Foods",
            billingEmail: "a@example.com",
            organizationId: "org_1",
        });
        expect(service.create).toHaveBeenCalledWith(
            "user_1",
            { legalName: "Asha Foods", billingEmail: "a@example.com" },
            "org_1",
        );
        await controller.update(user, "bprof_1", { city: "Pune" });
        expect(service.update).toHaveBeenCalledWith("user_1", "bprof_1", {
            city: "Pune",
        });
        await controller.move(user, "bprof_1", "org_1");
        expect(service.move).toHaveBeenCalledWith("user_1", "bprof_1", "org_1");
        await controller.cancelPending(user, "bprof_1", "org_1");
        expect(service.cancelPending).toHaveBeenCalledWith(
            "user_1",
            "bprof_1",
            "org_1",
        );
        await controller.remove(user, "bprof_1");
        expect(service.remove).toHaveBeenCalledWith("user_1", "bprof_1");
        await controller.sync(user, "bprof_1");
        expect(service.retrySync).toHaveBeenCalledWith("user_1", "bprof_1");
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
