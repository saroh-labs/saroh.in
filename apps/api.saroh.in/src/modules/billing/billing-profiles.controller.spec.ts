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
import type { AuthUser } from "../../common/types/store-context";
import { BillingProfilesController } from "./billing-profiles.controller";
import type { BillingProfilesService } from "./billing-profiles.service";

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
