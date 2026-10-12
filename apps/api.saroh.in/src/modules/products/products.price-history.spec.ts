// Price history (owner, 12 Oct 2026) on every way a product's or an
// option's cost is written: create, the whole-product save, a section
// save, an option's create and save, and the copy. One entry, on the
// save's own transaction, with the value before and after and who made it;
// nothing when the cost did not move, and nothing when the save is refused
// or fails. DB-free: Prisma is mocked. What a real database keeps is in
// `price-history.db.spec.ts`; what an entry holds, `audit/price-history.spec.ts`.
jest.mock("@saroh/database", () => {
    const client = {
        product: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            findUniqueOrThrow: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        productVariant: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        productListing: { findMany: jest.fn() },
        businessProfile: { findUnique: jest.fn() },
        storeSettings: { findUnique: jest.fn() },
        auditEvent: { create: jest.fn(), findMany: jest.fn() },
        user: { findMany: jest.fn() },
        $transaction: jest.fn(),
    };
    return { prisma: client };
});
jest.mock("../sites/page-cache-revalidate", () => ({
    enqueuePageRevalidation: jest.fn().mockResolvedValue(false),
}));
// Where it is listed and how its shelves are locked are not this spec's.
jest.mock("./listings.service", () => ({ listAt: jest.fn() }));
jest.mock("./stock-levels", () => ({
    lockProduct: jest.fn(),
    lockProductStock: jest.fn().mockResolvedValue([]),
}));

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import type { OrgAction } from "../organizations/organization-actions";
import type { StoresService } from "../stores/stores.service";
import type {
    CreateProductDto,
    PatchProductDto,
    UpdateProductDto,
} from "./dto";
import type { ProductScope } from "./product-access";
import { ProductAccess } from "./product-access";
import { duplicateProduct } from "./product-duplicate";
import { ProductsService } from "./products.service";
import type { CreateVariantDto } from "./variants.dto";
import { VariantsService } from "./variants.service";

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const transaction = prisma.$transaction as unknown as jest.Mock;
const entries = () =>
    db.auditEvent!.create!.mock.calls.map(
        (call) => (call[0] as { data: Record<string, unknown> }).data,
    );

const products = new ProductsService({} as unknown as StoresService);
const variants = new VariantsService(products);
const scope = {
    organizationId: "org_1",
    userId: "u_asha",
    roleKey: "OWNER",
    storeId: "st_1",
} as unknown as ProductScope;

const decimal = (value: string | null) =>
    value === null ? null : { toString: () => value };

interface Stored {
    price?: string;
    mrp?: string | null;
    gstRate?: string | null;
    gstPriceMode?: string | null;
}

/** The product as it is stored, for the write under test to read. */
function stored(over: Stored = {}) {
    const row = {
        id: "p_1",
        name: "Rye loaf",
        slug: "rye-loaf",
        price: decimal(over.price ?? "780"),
        mrp: decimal(over.mrp === undefined ? null : over.mrp),
        currency: "INR",
        gstRate: decimal(over.gstRate === undefined ? "5" : over.gstRate),
        gstPriceMode: over.gstPriceMode ?? null,
        status: "PUBLISHED",
        optionId: null,
        madeHere: true,
        maker: null,
        returnsMode: "STOREFRONT",
        returnsText: null,
        shopFields: {},
        _count: { variants: 0 },
        variants: [],
    };
    db.product!.findFirst!.mockResolvedValue(row);
    db.product!.findUniqueOrThrow!.mockResolvedValue(row);
    return row;
}

beforeEach(() => {
    jest.clearAllMocks();
    // Registered, prices include GST: no save here is refused for its MRP
    // unless a test says so.
    db.businessProfile!.findUnique!.mockResolvedValue({
        gstRegistered: true,
        gstState: "29",
        taxId: "29AAGCR4375J1ZU",
        gstPriceMode: "INCLUDED",
    });
    db.storeSettings!.findUnique!.mockResolvedValue({ currency: "INR" });
    db.product!.findUnique!.mockResolvedValue(null);
    db.product!.update!.mockResolvedValue({ id: "p_1" });
    db.product!.create!.mockResolvedValue({ id: "p_new", currency: "INR" });
    db.productListing!.findMany!.mockResolvedValue([]);
    // Every write runs on the fake, as its own transaction.
    transaction.mockImplementation((work: (tx: typeof db) => unknown) =>
        work(db),
    );
    jest.spyOn(planMeter, "roomInTx").mockResolvedValue(null);
    jest.spyOn(planMeter, "assertRoom").mockResolvedValue(undefined as never);
    jest.spyOn(products, "getIn").mockResolvedValue({ id: "p_1" } as never);
});

describe("a new product", () => {
    const create = (over: Partial<CreateProductDto> = {}) =>
        products.createIn(scope, {
            name: "Rye loaf",
            price: "780",
            ...over,
        } as CreateProductDto);

    it("starts its history at what it was made at, by who made it", async () => {
        await create({ mrp: "1000", gstRate: "5", gstPriceMode: "ADDED" });
        expect(entries()).toEqual([
            {
                action: "price.set",
                actorUserId: "u_asha",
                organizationId: "org_1",
                targetType: "product",
                targetId: "p_new",
                outcome: "SUCCESS",
                metadata: {
                    kind: "PRODUCT",
                    name: "Rye loaf",
                    currency: "INR",
                    source: "editor",
                    changes: [
                        { field: "price", before: null, after: "780.00" },
                        { field: "mrp", before: null, after: "1000.00" },
                        { field: "gstRate", before: null, after: "5" },
                        { field: "gstPriceMode", before: null, after: "ADDED" },
                    ],
                },
            },
        ]);
    });

    it("says only the price when that is all it has", async () => {
        await create();
        expect(entries()).toHaveLength(1);
        expect(entries()[0]!.metadata).toMatchObject({
            changes: [{ field: "price", before: null, after: "780.00" }],
        });
    });

    it("a Saroh operator's is marked, so it reads as Saroh support", async () => {
        await products.createIn(
            { ...scope, roleKey: "platform-operator" } as ProductScope,
            { name: "Rye loaf", price: "780" } as CreateProductDto,
        );
        expect(entries()[0]!.metadata).toMatchObject({ byOperator: true });
    });

    it("keeps nothing when the product is refused", async () => {
        db.businessProfile!.findUnique!.mockResolvedValue({
            gstRegistered: true,
            gstState: "29",
            taxId: "29AAGCR4375J1ZU",
            gstPriceMode: "ADDED",
        });
        // 1,000 + 18% = 1,180, above an MRP of 1,100.
        await expect(
            create({ price: "1000", mrp: "1100", gstRate: "18" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(transaction).not.toHaveBeenCalled();
        expect(entries()).toEqual([]);
    });
});

describe("saving a section of a product", () => {
    const patch = (dto: PatchProductDto) => products.patchIn(scope, "p_1", dto);

    it("a new price records the price before and after", async () => {
        stored({ price: "780" });
        await patch({ price: "820" });
        expect(entries()).toEqual([
            expect.objectContaining({
                action: "price.changed",
                actorUserId: "u_asha",
                targetType: "product",
                targetId: "p_1",
                metadata: {
                    kind: "PRODUCT",
                    name: "Rye loaf",
                    currency: "INR",
                    source: "editor",
                    changes: [
                        { field: "price", before: "780.00", after: "820.00" },
                    ],
                },
            }),
        ]);
    });

    it("several fields in one save are one entry", async () => {
        stored({ price: "780", mrp: null, gstRate: "5", gstPriceMode: null });
        await patch({
            price: "820",
            mrp: "1000",
            gstRate: "18",
            gstPriceMode: "INCLUDED",
        });
        expect(entries()).toHaveLength(1);
        expect(entries()[0]!.metadata).toMatchObject({
            changes: [
                { field: "price", before: "780.00", after: "820.00" },
                { field: "mrp", before: null, after: "1000.00" },
                { field: "gstRate", before: "5", after: "18" },
                { field: "gstPriceMode", before: null, after: "INCLUDED" },
            ],
        });
    });

    it("an MRP taken away and a rate cleared are changes to nothing", async () => {
        stored({ price: "780", mrp: "1000", gstRate: "5" });
        await patch({ mrp: null, gstRate: null } as PatchProductDto);
        expect(entries()[0]!.metadata).toMatchObject({
            changes: [
                { field: "mrp", before: "1000.00", after: null },
                { field: "gstRate", before: "5", after: null },
            ],
        });
    });

    it("keeps nothing when the cost did not move", async () => {
        stored({ price: "780", gstRate: "5" });
        // Another section, and a price sent as it already is.
        await patch({ name: "Rye loaf, large" });
        await patch({ price: "780.00", gstRate: "5" });
        expect(db.product!.update).toHaveBeenCalledTimes(2);
        expect(entries()).toEqual([]);
    });

    it("names the product as the save leaves it", async () => {
        stored({ price: "780" });
        await patch({ name: "Rye loaf, large", price: "820" });
        expect(entries()[0]!.metadata).toMatchObject({
            name: "Rye loaf, large",
        });
    });

    it("keeps nothing when the save is refused", async () => {
        db.businessProfile!.findUnique!.mockResolvedValue({
            gstRegistered: true,
            gstState: "29",
            taxId: "29AAGCR4375J1ZU",
            gstPriceMode: "ADDED",
        });
        stored({ price: "900", mrp: "1100", gstRate: "18" });
        await expect(patch({ price: "1000" })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(db.product!.update).not.toHaveBeenCalled();
        expect(entries()).toEqual([]);
    });

    it("keeps nothing when the save fails", async () => {
        stored({ price: "780" });
        db.product!.update!.mockRejectedValue(new Error("the database went"));
        await expect(patch({ price: "820" })).rejects.toThrow(
            "the database went",
        );
        expect(entries()).toEqual([]);
    });

    it("writes the entry on the save's own transaction", async () => {
        stored({ price: "780" });
        const tx = {
            product: { update: jest.fn().mockResolvedValue({ id: "p_1" }) },
            auditEvent: { create: jest.fn() },
        };
        transaction.mockImplementation((work: (t: typeof tx) => unknown) =>
            work(tx),
        );
        await patch({ price: "820" });
        expect(tx.product.update).toHaveBeenCalledTimes(1);
        expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
        expect(db.auditEvent!.create).not.toHaveBeenCalled();
    });
});

describe("the whole-product save", () => {
    const update = (price: string) =>
        products.updateIn(scope, "p_1", {
            name: "Rye loaf",
            slug: "rye-loaf",
            price,
        } as UpdateProductDto);

    it("a new price is recorded; the MRP and the GST it leaves alone are not", async () => {
        stored({ price: "780", mrp: "1000", gstRate: "5" });
        await update("820");
        expect(entries()).toHaveLength(1);
        expect(entries()[0]).toMatchObject({
            action: "price.changed",
            targetId: "p_1",
            metadata: {
                changes: [
                    { field: "price", before: "780.00", after: "820.00" },
                ],
            },
        });
    });

    it("keeps nothing for a price it does not change", async () => {
        stored({ price: "780" });
        await update("780");
        expect(db.product!.update).toHaveBeenCalledTimes(1);
        expect(entries()).toEqual([]);
    });
});

describe("an option", () => {
    const body = (over: Partial<CreateVariantDto>) =>
        ({ sku: "RL-L", title: "Large", ...over }) as CreateVariantDto;

    beforeEach(() => {
        stored({ price: "780" });
        db.productVariant!.create!.mockImplementation(
            ({ data }: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: "v_new", ...data }),
        );
        db.productVariant!.update!.mockImplementation(
            ({ data }: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: "v_1", ...data }),
        );
    });

    it("made with a price of its own starts its history, on the product, by name", async () => {
        db.productVariant!.findFirst!.mockResolvedValue({ position: 0 });
        await variants.createIn(scope, "p_1", body({ price: "900" }));
        expect(entries()).toEqual([
            expect.objectContaining({
                action: "price.set",
                actorUserId: "u_asha",
                targetType: "product",
                targetId: "p_1",
                metadata: {
                    kind: "PRODUCT",
                    name: "Rye loaf",
                    currency: "INR",
                    source: "editor",
                    option: { id: "v_new", title: "Large" },
                    changes: [
                        { field: "price", before: null, after: "900.00" },
                    ],
                },
            }),
        ]);
    });

    it("made at the product's price has no history of its own yet", async () => {
        db.productVariant!.findFirst!.mockResolvedValue({ position: 0 });
        await variants.createIn(scope, "p_1", body({}));
        expect(db.productVariant!.create).toHaveBeenCalledTimes(1);
        expect(entries()).toEqual([]);
    });

    it("a new price or MRP records each, before and after", async () => {
        db.productVariant!.findFirst!.mockResolvedValue({
            id: "v_1",
            price: decimal("900"),
            mrp: null,
        });
        await variants.updateIn(
            scope,
            "p_1",
            "v_1",
            body({ price: "950", mrp: "1200" }),
        );
        expect(entries()).toHaveLength(1);
        expect(entries()[0]).toMatchObject({
            action: "price.changed",
            targetType: "product",
            targetId: "p_1",
            metadata: {
                option: { id: "v_1", title: "Large" },
                changes: [
                    { field: "price", before: "900.00", after: "950.00" },
                    { field: "mrp", before: null, after: "1200.00" },
                ],
            },
        });
    });

    it("going back to the product's price is a change to nothing", async () => {
        db.productVariant!.findFirst!.mockResolvedValue({
            id: "v_1",
            price: decimal("900"),
            mrp: null,
        });
        await variants.updateIn(scope, "p_1", "v_1", body({}));
        expect(entries()[0]!.metadata).toMatchObject({
            changes: [{ field: "price", before: "900.00", after: null }],
        });
    });

    it("keeps nothing for a save that leaves its price and MRP alone", async () => {
        db.productVariant!.findFirst!.mockResolvedValue({
            id: "v_1",
            price: decimal("900"),
            mrp: null,
        });
        await variants.updateIn(
            scope,
            "p_1",
            "v_1",
            body({ title: "Extra large", price: "900.00" }),
        );
        expect(db.productVariant!.update).toHaveBeenCalledTimes(1);
        expect(entries()).toEqual([]);
    });

    it("keeps nothing when its save fails", async () => {
        db.productVariant!.findFirst!.mockResolvedValue({
            id: "v_1",
            price: decimal("900"),
            mrp: null,
        });
        db.productVariant!.update!.mockRejectedValue(new Error("gone"));
        await expect(
            variants.updateIn(scope, "p_1", "v_1", body({ price: "950" })),
        ).rejects.toThrow("gone");
        expect(entries()).toEqual([]);
    });
});

describe("a copy", () => {
    it("starts its own history, the product's and each priced option's", async () => {
        db.product!.findFirst!.mockResolvedValue({
            id: "p_1",
            name: "Rye loaf",
            slug: "rye-loaf",
            price: decimal("780"),
            mrp: decimal("1000"),
            currency: "INR",
            gstRate: decimal("5"),
            gstPriceMode: null,
            shopFields: {},
            seoImageId: null,
            images: [],
            listings: [],
            stockLevels: [],
            fieldValues: [],
            allergens: [],
            variants: [
                {
                    id: "v_1",
                    sku: "RL-L",
                    title: "Large",
                    price: decimal("900"),
                    mrp: null,
                    imageId: null,
                    position: 0,
                },
                // Sold at the product's price: no history of its own.
                {
                    id: "v_2",
                    sku: "RL-S",
                    title: "Small",
                    price: null,
                    mrp: null,
                    imageId: null,
                    position: 1,
                },
            ],
        });
        db.product!.count!.mockResolvedValue(0);
        db.productVariant!.count!.mockResolvedValue(0);
        db.product!.create!.mockResolvedValue({
            id: "p_copy",
            name: "Rye loaf (copy)",
        });
        let made = 0;
        db.productVariant!.create!.mockImplementation(() =>
            Promise.resolve({ id: `v_copy_${++made}` }),
        );
        await duplicateProduct(prisma as unknown as Prisma.TransactionClient, {
            organizationId: "org_1",
            productId: "p_1",
            storeId: "st_1",
            actor: { organizationId: "org_1", userId: "u_asha" },
        });
        expect(entries()).toEqual([
            expect.objectContaining({
                action: "price.set",
                actorUserId: "u_asha",
                targetType: "product",
                targetId: "p_copy",
                metadata: {
                    kind: "PRODUCT",
                    name: "Rye loaf (copy)",
                    currency: "INR",
                    source: "copy",
                    changes: [
                        { field: "price", before: null, after: "780.00" },
                        { field: "mrp", before: null, after: "1000.00" },
                        { field: "gstRate", before: null, after: "5" },
                    ],
                },
            }),
            expect.objectContaining({
                action: "price.set",
                targetId: "p_copy",
                metadata: expect.objectContaining({
                    source: "copy",
                    option: { id: "v_copy_1", title: "Large" },
                    changes: [
                        { field: "price", before: null, after: "900.00" },
                    ],
                }),
            }),
        ]);
    });
});

describe("reading a product's price history", () => {
    it("is the business's own product's, newest first", async () => {
        db.product!.findFirst!.mockResolvedValue({ id: "p_1" });
        db.auditEvent!.findMany!.mockResolvedValue([]);
        await expect(
            products.priceHistory("org_1", "p_1", { limit: 10 }),
        ).resolves.toEqual({ entries: [], nextCursor: null });
        expect(db.product!.findFirst).toHaveBeenCalledWith({
            where: { id: "p_1", organizationId: "org_1" },
            select: { id: true },
        });
        expect(db.auditEvent!.findMany!.mock.calls[0]![0]).toMatchObject({
            where: {
                organizationId: "org_1",
                targetType: "product",
                targetId: "p_1",
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 11,
        });
    });

    it("another business's product is not found, and nothing is read", async () => {
        db.product!.findFirst!.mockResolvedValue(null);
        await expect(
            products.priceHistory("org_1", "p_theirs"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.auditEvent!.findMany).not.toHaveBeenCalled();
    });

    it("needs the permission the product page needs: store:read", () => {
        const access = new ProductAccess({} as unknown as StoresService);
        const ctx = (...actions: OrgAction[]): OrganizationContext => ({
            organizationId: "org_1",
            userId: "u_1",
            role: "MEMBER",
            roleKey: "desk",
            actions: new Set(actions),
        });
        expect(access.business(ctx("store:read")).organizationId).toBe("org_1");
        expect(() => access.business(ctx("service:read"))).toThrow(
            ForbiddenException,
        );
    });
});
