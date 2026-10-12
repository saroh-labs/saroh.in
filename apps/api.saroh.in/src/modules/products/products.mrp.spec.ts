// GST is part of MRP (the owner, 12 Oct 2026) on every place a product's or
// an option's price, MRP, rate or way of carrying GST is written: create,
// the whole-product save, a section save, a variant's create and save, and
// the copy. DB-free: Prisma is mocked, and the page cache is left out. The
// rule's own sums are in `product-rules.spec.ts`; the rows it reads from a
// real database are in `mrp-includes-gst.db.spec.ts`.
jest.mock("@saroh/database", () => {
    const client = {
        product: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            findUniqueOrThrow: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        productVariant: {
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        businessProfile: { findUnique: jest.fn() },
        storeSettings: { findUnique: jest.fn() },
        $transaction: jest.fn(),
    };
    return { prisma: client };
});
jest.mock("../sites/page-cache-revalidate", () => ({
    enqueuePageRevalidation: jest.fn().mockResolvedValue(false),
}));

import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { StoresService } from "../stores/stores.service";
import type {
    CreateProductDto,
    PatchProductDto,
    UpdateProductDto,
} from "./dto";
import type { ProductScope } from "./product-access";
import { duplicateProduct } from "./product-duplicate";
import { ProductsService } from "./products.service";
import type { CreateVariantDto } from "./variants.dto";
import { VariantsService } from "./variants.service";

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;

const products = new ProductsService({} as unknown as StoresService);
const variants = new VariantsService(products);
const scope = {
    organizationId: "org_1",
    storeId: "st_1",
} as unknown as ProductScope;

const decimal = (value: string | null) =>
    value === null ? null : { toString: () => value };

/** How the business stands: registered or not, and its way with GST. */
function business(
    registered: boolean,
    mode: "INCLUDED" | "ADDED" | null = null,
) {
    db.businessProfile!.findUnique!.mockResolvedValue({
        gstRegistered: registered,
        gstState: registered ? "29" : null,
        taxId: registered ? "29AAGCR4375J1ZU" : null,
        gstPriceMode: mode,
    });
}

interface Stored {
    price?: string;
    mrp?: string | null;
    gstRate?: string | null;
    gstPriceMode?: string | null;
    status?: string;
    variants?: { title: string; price: string | null; mrp: string | null }[];
}

/** The product as it is stored, for the write under test to read. */
function stored(over: Stored = {}) {
    const row = {
        id: "p_1",
        name: "Face cream",
        slug: "face-cream",
        price: decimal(over.price ?? "1000"),
        mrp: decimal(over.mrp === undefined ? "1200" : over.mrp),
        currency: "INR",
        gstRate: decimal(over.gstRate === undefined ? "18" : over.gstRate),
        gstPriceMode: over.gstPriceMode ?? null,
        status: over.status ?? "PUBLISHED",
        optionId: null,
        madeHere: true,
        maker: null,
        returnsMode: "STOREFRONT",
        returnsText: null,
        shopFields: {},
        _count: { variants: (over.variants ?? []).length },
        variants: (over.variants ?? []).map((v) => ({
            title: v.title,
            price: decimal(v.price),
            mrp: decimal(v.mrp),
        })),
    };
    db.product!.findFirst!.mockResolvedValue(row);
    db.product!.findUniqueOrThrow!.mockResolvedValue(row);
    return row;
}

/** What a refused write said, and where. */
async function refusal(
    write: Promise<unknown>,
): Promise<{ message: string; field: string }> {
    const error: unknown = await write.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
        message: string;
        field: string;
    };
}

const OVER_1100 =
    "With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. Lower the price, raise the MRP, or set this product's price to include GST.";
const BELOW = "MRP can't be lower than the price it sells for.";

beforeEach(() => {
    jest.clearAllMocks();
    business(true, "ADDED");
    db.product!.findUnique!.mockResolvedValue(null);
    db.product!.update!.mockResolvedValue({ id: "p_1" });
    db.productVariant!.update!.mockResolvedValue({ id: "v_1" });
    db.storeSettings!.findUnique!.mockResolvedValue({ currency: "INR" });
    // A write that passes every check: the transaction's work is not this
    // spec's.
    (prisma.$transaction as jest.Mock).mockResolvedValue("p_new");
    jest.spyOn(products, "getIn").mockResolvedValue({ id: "p_1" } as never);
});

describe("creating a product", () => {
    const create = (over: Partial<CreateProductDto>) =>
        products.createIn(scope, {
            name: "Face cream",
            price: "1000",
            gstRate: "18",
            ...over,
        } as CreateProductDto);

    it("GST is added: refused above the MRP, on the MRP, with the sums", async () => {
        // 1,000 + 180 = 1,180 > 1,100
        expect(await refusal(create({ mrp: "1100" }))).toEqual({
            message: OVER_1100,
            field: "mrp",
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("GST is added: allowed at exactly the MRP, and below it", async () => {
        await expect(create({ mrp: "1180" })).resolves.toEqual({ id: "p_new" });
        await expect(create({ mrp: "1500" })).resolves.toEqual({ id: "p_new" });
    });

    it("at 5, 12 and 28 percent: ₹1,050, ₹1,120 and ₹1,280 to pay", async () => {
        for (const [gstRate, pay, short] of [
            ["5", "1050", "1049.99"],
            ["12", "1120", "1119.99"],
            ["28", "1280", "1279.99"],
        ] as const) {
            await expect(create({ gstRate, mrp: pay })).resolves.toEqual({
                id: "p_new",
            });
            expect((await refusal(create({ gstRate, mrp: short }))).field).toBe(
                "mrp",
            );
        }
    });

    it("prices include GST: unchanged. The typed price is compared", async () => {
        business(true, "INCLUDED");
        await expect(create({ mrp: "1100" })).resolves.toEqual({ id: "p_new" });
        await expect(create({ mrp: "1000" })).resolves.toEqual({ id: "p_new" });
        expect(await refusal(create({ mrp: "999" }))).toEqual({
            message: BELOW,
            field: "mrp",
        });
    });

    it("the product's own choice decides, both ways", async () => {
        business(true, "INCLUDED");
        expect(
            (await refusal(create({ mrp: "1100", gstPriceMode: "ADDED" })))
                .message,
        ).toBe(OVER_1100);
        business(true, "ADDED");
        await expect(
            create({ mrp: "1100", gstPriceMode: "INCLUDED" }),
        ).resolves.toEqual({ id: "p_new" });
    });

    it("a business that isn't registered is untouched", async () => {
        business(false, "ADDED");
        await expect(create({ mrp: "1100" })).resolves.toEqual({ id: "p_new" });
        expect((await refusal(create({ mrp: "999" }))).message).toBe(BELOW);
    });

    it("with no MRP, asks nothing of the business", async () => {
        await expect(create({})).resolves.toEqual({ id: "p_new" });
        expect(db.businessProfile!.findUnique).not.toHaveBeenCalled();
    });
});

describe("saving a section of a product", () => {
    const patch = (dto: PatchProductDto) => products.patchIn(scope, "p_1", dto);

    it("a price that GST takes over the stored MRP is refused on the price", async () => {
        stored({ price: "900", mrp: "1100" });
        // 1,000 + 180 = 1,180 > 1,100
        expect(await refusal(patch({ price: "1000" }))).toEqual({
            message: OVER_1100,
            field: "price",
        });
        expect(db.product!.update).not.toHaveBeenCalled();
    });

    it("an MRP under the amount to pay is refused on the MRP, and one at it is saved", async () => {
        stored({ price: "1000", mrp: "1200" });
        expect(await refusal(patch({ mrp: "1100" }))).toEqual({
            message: OVER_1100,
            field: "mrp",
        });
        await patch({ mrp: "1180" });
        expect(db.product!.update).toHaveBeenCalledWith({
            where: { id: "p_1" },
            data: { mrp: "1180" },
        });
    });

    it("a rate that takes it over is refused on the rate: 12% fits ₹1,120, 18% does not", async () => {
        stored({ price: "1000", mrp: "1120", gstRate: "12" });
        const said = await refusal(patch({ gstRate: "18" }));
        expect(said.field).toBe("gstRate");
        expect(said.message).toBe(
            "With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,120. Lower the price, raise the MRP, or set this product's price to include GST.",
        );
        await expect(patch({ gstRate: "5" })).resolves.toBeDefined();
    });

    it("setting this product to GST is added is refused on that choice, and back to includes is saved", async () => {
        business(true, "INCLUDED");
        stored({ price: "1000", mrp: "1100" });
        expect(await refusal(patch({ gstPriceMode: "ADDED" }))).toEqual({
            message: OVER_1100,
            field: "gstPriceMode",
        });
        business(true, "ADDED");
        stored({ price: "1000", mrp: "1100", gstPriceMode: "ADDED" });
        await patch({ gstPriceMode: "INCLUDED" });
        expect(db.product!.update).toHaveBeenCalledWith({
            where: { id: "p_1" },
            data: { gstPriceMode: "INCLUDED" },
        });
    });

    it("an option GST takes over its own MRP is named, on a save that changes the rate", async () => {
        stored({
            price: "1000",
            mrp: "1500",
            gstRate: "5",
            variants: [{ title: "Large", price: "1200", mrp: "1300" }],
        });
        // Large: 1,200 + 216 = 1,416 > 1,300
        expect(await refusal(patch({ gstRate: "18" }))).toEqual({
            message:
                "Large: with 18% GST added this is ₹1,416 to pay, more than its MRP of ₹1,300. Lower the price, raise the MRP, or set this product's price to include GST.",
            field: "gstRate",
        });
    });

    it("prices include GST: unchanged", async () => {
        business(true, "INCLUDED");
        stored({ price: "1000", mrp: "1200" });
        await expect(patch({ mrp: "1100" })).resolves.toBeDefined();
        await expect(patch({ mrp: "1000" })).resolves.toBeDefined();
        expect(await refusal(patch({ mrp: "999" }))).toEqual({
            message: BELOW,
            field: "mrp",
        });
        expect(await refusal(patch({ price: "1201" }))).toEqual({
            message: BELOW,
            field: "price",
        });
    });

    it("a business that isn't registered is untouched", async () => {
        business(false);
        stored({ price: "1000", mrp: "1200" });
        await expect(
            patch({ mrp: "1100", gstRate: "28" }),
        ).resolves.toBeDefined();
        expect((await refusal(patch({ mrp: "999" }))).message).toBe(BELOW);
    });

    it("a product already over its MRP can still have the rest of it saved", async () => {
        // Switched before the rule existed: 1,180 to pay against 1,100.
        stored({ price: "1000", mrp: "1100" });
        await patch({ name: "Face cream, 50 ml" });
        expect(db.product!.update).toHaveBeenCalledWith({
            where: { id: "p_1" },
            data: { name: "Face cream, 50 ml" },
        });
        // Its sums sent back as they are change nothing, so nothing is said.
        await expect(
            patch({ price: "1000.00", mrp: "1100.00", gstRate: "18" }),
        ).resolves.toBeDefined();
        // Touching the sum without mending it is refused.
        expect((await refusal(patch({ price: "990" }))).field).toBe("price");
        // And it is not put back on sale as it is.
        stored({ price: "1000", mrp: "1100", status: "DRAFT" });
        expect((await refusal(patch({ status: "PUBLISHED" }))).message).toBe(
            OVER_1100,
        );
        stored({ price: "1000", mrp: "1100", status: "ARCHIVED" });
        expect((await refusal(patch({ status: "DRAFT" }))).message).toBe(
            OVER_1100,
        );
    });

    it("a product over its MRP can always be taken off sale", async () => {
        stored({ price: "1000", mrp: "1100", status: "PUBLISHED" });
        await patch({ status: "DRAFT" });
        expect(db.product!.update).toHaveBeenLastCalledWith({
            where: { id: "p_1" },
            data: { status: "DRAFT", archivedAt: null },
        });
        await patch({ status: "ARCHIVED" });
        expect(db.product!.update).toHaveBeenLastCalledWith({
            where: { id: "p_1" },
            data: { status: "ARCHIVED", archivedAt: expect.any(Date) },
        });
    });
});

describe("the whole-product save", () => {
    const update = (price: string, status?: UpdateProductDto["status"]) =>
        products.updateIn(scope, "p_1", {
            name: "Face cream",
            slug: "face-cream",
            price,
            ...(status ? { status } : {}),
        } as UpdateProductDto);

    it("GST is added: a price that takes it over the stored MRP is refused, one at the MRP saved", async () => {
        stored({ price: "900", mrp: "1100" });
        expect(await refusal(update("1000"))).toEqual({
            message: OVER_1100,
            field: "price",
        });
        expect(db.product!.update).not.toHaveBeenCalled();
        stored({ price: "900", mrp: "1180" });
        await expect(update("1000")).resolves.toEqual({ id: "p_1" });
    });

    it("prices include GST: the typed price against the stored MRP", async () => {
        business(true, "INCLUDED");
        stored({ price: "900", mrp: "1100" });
        await expect(update("1100")).resolves.toEqual({ id: "p_1" });
        expect((await refusal(update("1100.01"))).message).toBe(BELOW);
    });

    it("leaves a price it does not change alone", async () => {
        stored({ price: "1000", mrp: "1100" });
        await expect(update("1000")).resolves.toEqual({ id: "p_1" });
    });
});

describe("a variant", () => {
    const body = (over: Partial<CreateVariantDto>) =>
        ({ sku: "FC-L", title: "Large", ...over }) as CreateVariantDto;

    beforeEach(() => {
        db.productVariant!.findFirst!.mockResolvedValue({
            id: "v_1",
            position: 0,
            price: null,
            mrp: null,
        });
        (prisma.$transaction as jest.Mock).mockResolvedValue({ id: "v_new" });
    });

    it("its own price against the product's MRP, by the amount to pay", async () => {
        stored({ price: "900", mrp: "1100" });
        expect(
            await refusal(
                variants.createIn(scope, "p_1", body({ price: "1000" })),
            ),
        ).toEqual({ message: OVER_1100, field: "price" });
        // 932.20 + 167.80 = 1,100.00: exactly the MRP.
        await expect(
            variants.createIn(scope, "p_1", body({ price: "932.20" })),
        ).resolves.toEqual({ id: "v_new" });
    });

    it("its own MRP against what it sells for, on the MRP", async () => {
        stored({ price: "1000", mrp: "1500" });
        expect(
            await refusal(
                variants.createIn(scope, "p_1", body({ mrp: "1100" })),
            ),
        ).toEqual({ message: OVER_1100, field: "mrp" });
        await expect(
            variants.createIn(scope, "p_1", body({ mrp: "1180" })),
        ).resolves.toEqual({ id: "v_new" });
    });

    it("a save follows the same rule, and the product's own choice", async () => {
        stored({ price: "900", mrp: "1100" });
        expect(
            await refusal(
                variants.updateIn(scope, "p_1", "v_1", body({ price: "1000" })),
            ),
        ).toEqual({ message: OVER_1100, field: "price" });
        expect(db.productVariant!.update).not.toHaveBeenCalled();
        stored({ price: "900", mrp: "1100", gstPriceMode: "INCLUDED" });
        await expect(
            variants.updateIn(scope, "p_1", "v_1", body({ price: "1000" })),
        ).resolves.toEqual({ id: "v_1" });
    });

    it("prices include GST, or not registered: the typed price, as it always was", async () => {
        for (const terms of [
            () => business(true, "INCLUDED"),
            () => business(false),
        ]) {
            terms();
            stored({ price: "900", mrp: "1100" });
            await expect(
                variants.createIn(scope, "p_1", body({ price: "1100" })),
            ).resolves.toEqual({ id: "v_new" });
            expect(
                await refusal(
                    variants.createIn(scope, "p_1", body({ price: "1101" })),
                ),
            ).toEqual({ message: BELOW, field: "price" });
        }
    });

    it("a variant already over its MRP can be renamed, and not repriced over it", async () => {
        stored({ price: "900", mrp: "1100" });
        db.productVariant!.findFirst!.mockResolvedValue({
            id: "v_1",
            price: decimal("1000"),
            mrp: null,
        });
        await expect(
            variants.updateIn(
                scope,
                "p_1",
                "v_1",
                body({ title: "Large jar", price: "1000.00" }),
            ),
        ).resolves.toEqual({ id: "v_1" });
        expect(
            (
                await refusal(
                    variants.updateIn(
                        scope,
                        "p_1",
                        "v_1",
                        body({ price: "990" }),
                    ),
                )
            ).field,
        ).toBe("price");
    });
});

describe("copying a product", () => {
    const tx = prisma as unknown as Prisma.TransactionClient;
    const copy = () =>
        duplicateProduct(tx, {
            organizationId: "org_1",
            productId: "p_1",
            storeId: "st_1",
        });
    /** The copy got past the MRP rule: its next read is the free suffix. */
    const PAST = new Error("past the MRP rule");

    beforeEach(() => {
        db.product!.count!.mockRejectedValue(PAST);
    });

    it("is refused while the original is over its MRP, with the sums", async () => {
        stored({ price: "1000", mrp: "1100" });
        const said = await refusal(copy());
        expect(said.message).toBe(
            `Fix this product's price before you copy it. ${OVER_1100}`,
        );
        expect(db.product!.count).not.toHaveBeenCalled();
    });

    it("goes ahead at exactly the MRP, with prices that include GST, and with no MRP", async () => {
        stored({ price: "1000", mrp: "1180" });
        await expect(copy()).rejects.toBe(PAST);
        business(true, "INCLUDED");
        stored({ price: "1000", mrp: "1100" });
        await expect(copy()).rejects.toBe(PAST);
        business(true, "ADDED");
        stored({ price: "1000", mrp: null });
        await expect(copy()).rejects.toBe(PAST);
    });
});
