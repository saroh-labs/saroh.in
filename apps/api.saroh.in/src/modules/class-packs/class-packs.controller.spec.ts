// The class-pack routes: guarded like every organization route, under the
// Appointments module, and each hands the caller's own context and ids to
// the service — which is where who-may is decided (class-packs.service.spec).
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class OrganizationGuard {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class ModuleEnforcementGuard {},
}));

import "reflect-metadata";

import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import type { OrganizationContext } from "../../common/types/organization-context";
import { REQUIRE_MODULE_KEY } from "../capabilities/require-module.decorator";
import {
    BookingClassPackController,
    ClassPacksController,
} from "./class-packs.controller";
import type { ClassPacksService } from "./class-packs.service";

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "u_1",
    role: "OWNER",
};

const service = {
    listPacks: jest.fn(),
    listPurchases: jest.fn(),
    getPurchase: jest.fn(),
    getPack: jest.fn(),
    createPack: jest.fn(),
    updatePack: jest.fn(),
    setPackStatus: jest.fn(),
    sell: jest.fn(),
    useOnBooking: jest.fn(),
    removeFromBooking: jest.fn(),
};
const packs = new ClassPacksController(service as unknown as ClassPacksService);
const onBooking = new BookingClassPackController(
    service as unknown as ClassPacksService,
);

beforeEach(() => jest.clearAllMocks());

describe.each([
    ["ClassPacksController", ClassPacksController],
    ["BookingClassPackController", BookingClassPackController],
])("%s", (_name, controller) => {
    it("runs sign-in, organization and module guards, under Appointments", () => {
        const guards = (
            Reflect.getMetadata(GUARDS_METADATA, controller) as {
                name: string;
            }[]
        ).map((g) => g.name);
        expect(guards).toEqual([
            "BetterAuthGuard",
            "OrganizationGuard",
            "ModuleEnforcementGuard",
        ]);
        expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, controller)).toBe(
            "APPOINTMENTS",
        );
        expect(Reflect.getMetadata(PATH_METADATA, controller)).toMatch(
            /^organizations\/:organizationId\//,
        );
    });
});

describe("routes", () => {
    it("declares the purchase routes before `:packId`, so they are reachable", () => {
        const order = Object.getOwnPropertyNames(ClassPacksController.prototype)
            .map(
                (name) =>
                    Reflect.getMetadata(
                        PATH_METADATA,
                        (
                            ClassPacksController.prototype as unknown as Record<
                                string,
                                object
                            >
                        )[name]!,
                    ) as string | undefined,
            )
            .filter((p): p is string => typeof p === "string");
        expect(order.indexOf("purchases")).toBeLessThan(
            order.indexOf(":packId"),
        );
    });

    it("hands the caller's context and ids to the service", async () => {
        await packs.sell(ctx, "pack_1", { contactId: "c_1" });
        expect(service.sell).toHaveBeenCalledWith(ctx, "pack_1", {
            contactId: "c_1",
        });

        await packs.archive(ctx, "pack_1");
        expect(service.setPackStatus).toHaveBeenCalledWith(
            ctx,
            "pack_1",
            "ARCHIVED",
        );

        await onBooking.use(ctx, "bk_1", { packPurchaseId: "pp_1" });
        expect(service.useOnBooking).toHaveBeenCalledWith(ctx, "bk_1", {
            packPurchaseId: "pp_1",
        });

        await onBooking.remove(ctx, "bk_1");
        expect(service.removeFromBooking).toHaveBeenCalledWith(ctx, "bk_1");
    });
});
