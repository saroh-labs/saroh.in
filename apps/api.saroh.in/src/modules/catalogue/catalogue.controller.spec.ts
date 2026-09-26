/**
 * The SKU pattern reads take one query value each. A repeated key
 * (`?pattern=a&pattern=b`) arrives as an array and is refused with a 400 in
 * words, never read as "a,b" or passed to string code; one value goes
 * through as given. DB-free: the services are stand-ins.
 */
// The real guard loads better-auth, an ESM build the unit project does not
// transform.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import { BadRequestException } from "@nestjs/common";

import type { AuthUser } from "../../common/types/store-context";
import type { AllergensService } from "./allergens.service";
import { CatalogueController } from "./catalogue.controller";
import type { CatalogueService } from "./catalogue.service";
import type { FieldsService } from "./fields.service";
import type { OptionsService } from "./options.service";
import type { SkuService } from "./sku.service";

const user = { id: "user_1" } as AuthUser;

function build() {
    const sku = {
        get: jest.fn(async () => ({ pattern: "{N}" })),
        preview: jest.fn(async () => ({ rows: [] })),
    };
    const controller = new CatalogueController(
        {} as CatalogueService,
        {} as OptionsService,
        sku as unknown as SkuService,
        {} as FieldsService,
        {} as AllergensService,
    );
    return { controller, sku };
}

describe("CatalogueController — one query value at a time", () => {
    it("refuses a repeated productId with a 400", () => {
        const { controller, sku } = build();
        expect(() =>
            controller.skuPattern(user, "store_1", ["p_1", "p_2"]),
        ).toThrow(new BadRequestException("Send one product at a time."));
        expect(sku.get).not.toHaveBeenCalled();
    });

    it("refuses a repeated pattern with a 400", () => {
        const { controller, sku } = build();
        expect(() =>
            controller.skuPreview(user, "store_1", ["{N}", "{NAME}"]),
        ).toThrow(new BadRequestException("Send one pattern at a time."));
        expect(sku.preview).not.toHaveBeenCalled();
    });

    it("passes one value through as given", async () => {
        const { controller, sku } = build();
        await controller.skuPattern(user, "store_1", "p_1");
        await controller.skuPreview(user, "store_1", "{SKU}-{N}");
        expect(sku.get).toHaveBeenCalledWith("store_1", "user_1", "p_1");
        expect(sku.preview).toHaveBeenCalledWith(
            "store_1",
            "user_1",
            "{SKU}-{N}",
        );
    });

    it("reads a missing value as none", async () => {
        const { controller, sku } = build();
        await controller.skuPattern(user, "store_1", undefined);
        await controller.skuPreview(user, "store_1", undefined);
        expect(sku.get).toHaveBeenCalledWith("store_1", "user_1", undefined);
        expect(sku.preview).toHaveBeenCalledWith("store_1", "user_1", "");
    });
});
