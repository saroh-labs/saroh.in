/**
 * The SKU pattern reads take one query value each. A repeated key
 * (`?pattern=a&pattern=b`) arrives as an array and is refused with a 400 in
 * words, never read as "a,b" or passed to string code; one value goes
 * through as given. Both owners of those reads are held to it: the
 * business's catalogue routes and the old per-storefront aliases (#529).
 * DB-free: the services are stand-ins.
 */
// The real guard loads better-auth, an ESM build the unit project does not
// transform.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import { BadRequestException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import type { MergeReportService } from "../products/merge-report.service";
import type { AllergensService } from "./allergens.service";
import type { CatalogueAccess } from "./catalogue-access";
import { OrganizationCatalogueController } from "./catalogue.controller";
import type { CatalogueService } from "./catalogue.service";
import type { FieldsService } from "./fields.service";
import type { OptionsService } from "./options.service";
import type { SkuService } from "./sku.service";
import { CatalogueController } from "./store-catalogue.controller";

const user = { id: "user_1" } as AuthUser;
const ctx = { organizationId: "org_1" } as OrganizationContext;

function stand() {
    const sku = {
        get: jest.fn(async () => ({ pattern: "{N}" })),
        preview: jest.fn(async () => ({ rows: [] })),
    };
    const access = {
        read: jest.fn(() => ({ organizationId: "org_1", canWrite: true })),
        readViaStore: jest.fn(async () => ({
            organizationId: "org_1",
            canWrite: true,
        })),
    };
    return { sku, access };
}

function buildOrg() {
    const { sku, access } = stand();
    const controller = new OrganizationCatalogueController(
        access as unknown as CatalogueAccess,
        {} as CatalogueService,
        {} as OptionsService,
        sku as unknown as SkuService,
        {} as FieldsService,
        {} as AllergensService,
        {} as MergeReportService,
    );
    return { controller, sku };
}

function buildStore() {
    const { sku, access } = stand();
    const controller = new CatalogueController(
        access as unknown as CatalogueAccess,
        {} as CatalogueService,
        {} as OptionsService,
        sku as unknown as SkuService,
        {} as FieldsService,
        {} as AllergensService,
    );
    return { controller, sku, access };
}

describe("OrganizationCatalogueController — one query value at a time", () => {
    it("refuses a repeated productId with a 400", () => {
        const { controller, sku } = buildOrg();
        expect(() => controller.skuPattern(ctx, ["p_1", "p_2"])).toThrow(
            new BadRequestException("Send one product at a time."),
        );
        expect(sku.get).not.toHaveBeenCalled();
    });

    it("refuses a repeated pattern with a 400", () => {
        const { controller, sku } = buildOrg();
        expect(() => controller.skuPreview(ctx, ["{N}", "{NAME}"])).toThrow(
            new BadRequestException("Send one pattern at a time."),
        );
        expect(sku.preview).not.toHaveBeenCalled();
    });

    it("passes one value through as given", async () => {
        const { controller, sku } = buildOrg();
        await controller.skuPattern(ctx, "p_1");
        await controller.skuPreview(ctx, "{SKU}-{N}");
        expect(sku.get).toHaveBeenCalledWith("org_1", "p_1");
        expect(sku.preview).toHaveBeenCalledWith("org_1", "{SKU}-{N}");
    });

    it("reads a missing value as none", async () => {
        const { controller, sku } = buildOrg();
        await controller.skuPattern(ctx, undefined);
        await controller.skuPreview(ctx, undefined);
        expect(sku.get).toHaveBeenCalledWith("org_1", undefined);
        expect(sku.preview).toHaveBeenCalledWith("org_1", "");
    });
});

describe("CatalogueController (storefront alias) — one query value at a time", () => {
    it("refuses a repeated productId with a 400, before any lookup", async () => {
        const { controller, sku, access } = buildStore();
        await expect(
            controller.skuPattern(user, "store_1", ["p_1", "p_2"]),
        ).rejects.toThrow(
            new BadRequestException("Send one product at a time."),
        );
        expect(access.readViaStore).not.toHaveBeenCalled();
        expect(sku.get).not.toHaveBeenCalled();
    });

    it("refuses a repeated pattern with a 400, before any lookup", async () => {
        const { controller, sku, access } = buildStore();
        await expect(
            controller.skuPreview(user, "store_1", ["{N}", "{NAME}"]),
        ).rejects.toThrow(
            new BadRequestException("Send one pattern at a time."),
        );
        expect(access.readViaStore).not.toHaveBeenCalled();
        expect(sku.preview).not.toHaveBeenCalled();
    });

    it("passes one value through as given", async () => {
        const { controller, sku, access } = buildStore();
        await controller.skuPattern(user, "store_1", "p_1");
        await controller.skuPreview(user, "store_1", "{SKU}-{N}");
        expect(access.readViaStore).toHaveBeenCalledWith("store_1", "user_1");
        expect(sku.get).toHaveBeenCalledWith("org_1", "p_1");
        expect(sku.preview).toHaveBeenCalledWith("org_1", "{SKU}-{N}");
    });

    it("reads a missing value as none", async () => {
        const { controller, sku } = buildStore();
        await controller.skuPattern(user, "store_1", undefined);
        await controller.skuPreview(user, "store_1", undefined);
        expect(sku.get).toHaveBeenCalledWith("org_1", undefined);
        expect(sku.preview).toHaveBeenCalledWith("org_1", "");
    });
});
