// The class-pack routes: guarded like every organization route, under the
// Class packs module (E12; Appointments before it), and each hands the caller's own context and ids to
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
    sellingTerms: jest.fn(),
    useOnBooking: jest.fn(),
    removeFromBooking: jest.fn(),
    getPackEditor: jest.fn(),
    createPackDraft: jest.fn(),
    savePackDraft: jest.fn(),
    publishPack: jest.fn(),
    discardPackChanges: jest.fn(),
    deletePackDraft: jest.fn(),
};
const packs = new ClassPacksController(service as unknown as ClassPacksService);
const onBooking = new BookingClassPackController(
    service as unknown as ClassPacksService,
);

beforeEach(() => jest.clearAllMocks());

// ClassPacksController is gated per handler (#117): its history reads stay
// open with Class packs off, so the class carries no module, and
// `history-reads.gate.spec.ts` names which handlers are gated.
describe.each([
    ["ClassPacksController", ClassPacksController, undefined],
    ["BookingClassPackController", BookingClassPackController, "CLASS_PACKS"],
])("%s", (_name, controller, classModule) => {
    it("runs sign-in, organization and module guards, under Class packs", () => {
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
            classModule,
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
        expect(order.indexOf("selling")).toBeGreaterThanOrEqual(0);
        expect(order.indexOf("selling")).toBeLessThan(order.indexOf(":packId"));
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

        await packs.selling(ctx);
        expect(service.sellingTerms).toHaveBeenCalledWith(ctx);

        await packs.purchases(ctx, { contactId: "c_1", serviceId: "svc_1" });
        expect(service.listPurchases).toHaveBeenCalledWith(ctx, {
            contactId: "c_1",
            serviceId: "svc_1",
        });

        await onBooking.remove(ctx, "bk_1");
        expect(service.removeFromBooking).toHaveBeenCalledWith(ctx, "bk_1");
    });

    it("hands the Pack Editor's reads and writes, with the revision, to the service (E14)", async () => {
        await packs.createDraft(ctx, { name: "10 classes" });
        expect(service.createPackDraft).toHaveBeenCalledWith(ctx, {
            name: "10 classes",
        });

        await packs.getDraft(ctx, "pack_1");
        expect(service.getPackEditor).toHaveBeenCalledWith(ctx, "pack_1");

        await packs.saveDraft(ctx, "pack_1", { price: "5000", revision: 2 });
        expect(service.savePackDraft).toHaveBeenCalledWith(ctx, "pack_1", {
            price: "5000",
            revision: 2,
        });

        await packs.publish(ctx, "pack_1", { revision: 3 });
        expect(service.publishPack).toHaveBeenCalledWith(ctx, "pack_1", 3);

        await packs.discard(ctx, "pack_1", { revision: 4 });
        expect(service.discardPackChanges).toHaveBeenCalledWith(
            ctx,
            "pack_1",
            4,
        );

        await packs.remove(ctx, "pack_1", { revision: 5 });
        expect(service.deletePackDraft).toHaveBeenCalledWith(ctx, "pack_1", 5);
    });
});
