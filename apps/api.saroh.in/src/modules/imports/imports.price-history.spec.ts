// Price history (owner, 12 Oct 2026) on a product import: one entry for
// each row written, by whoever ran the import, on the row's own
// transaction. A new product starts its history; a row that updates one
// records what it moved, and nothing when it moved nothing. Mocked Prisma,
// no DB.
jest.mock("@saroh/database", () => ({
    prisma: {
        product: { findMany: jest.fn() },
        businessProfile: { findUnique: jest.fn() },
        storeSettings: { findUnique: jest.fn() },
        $transaction: jest.fn(),
    },
}));
// Where a written product is listed is not this spec's.
jest.mock("../products/listings.service", () => ({
    listAt: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../billing/metering.service", () => ({
    planMeter: {
        assertRoom: jest.fn().mockResolvedValue(undefined),
        roomInTx: jest.fn().mockResolvedValue(undefined),
    },
}));

import { prisma } from "@saroh/database";

import type { StoresService } from "../stores/stores.service";
import { ImportsService } from "./imports.service";

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const transaction = prisma.$transaction as unknown as jest.Mock;

const service = new ImportsService({
    writableOrganization: jest
        .fn()
        .mockResolvedValue({ organizationId: "org_1" }),
} as unknown as StoresService);

const MAPPING = { name: "name", price: "price", mrp: "mrp", gst: "gstRate" };
const decimal = (value: string | null) =>
    value === null ? null : { toString: () => value };

/** The transaction a chunk of rows is written on. */
function writes() {
    const tx = {
        product: {
            create: jest.fn(
                ({ data }: { data: { slug: string; currency?: string } }) =>
                    Promise.resolve({
                        id: `p_${data.slug}`,
                        currency: data.currency ?? "INR",
                    }),
            ),
            findUniqueOrThrow: jest.fn(),
            update: jest.fn().mockResolvedValue({ id: "p_1", currency: "INR" }),
        },
        storeSettings: db.storeSettings,
        auditEvent: { create: jest.fn() },
    };
    transaction.mockImplementation((work: (client: typeof tx) => unknown) =>
        work(tx),
    );
    const entries = () =>
        tx.auditEvent.create.mock.calls.map(
            (call) => (call[0] as { data: Record<string, unknown> }).data,
        );
    return { tx, entries };
}

const apply = (csv: string[], policy: "SKIP" | "UPDATE" = "SKIP") =>
    service.apply("st_1", "u_asha", "products", {
        csv: [...csv, ""].join("\n"),
        mapping: MAPPING,
        policy,
    });

beforeEach(() => {
    jest.clearAllMocks();
    // Registered, prices include GST: no row here is refused for its MRP.
    db.businessProfile!.findUnique!.mockResolvedValue({
        gstRegistered: true,
        gstState: "29",
        taxId: "29AAGCR4375J1ZU",
        gstPriceMode: "INCLUDED",
    });
    db.storeSettings!.findUnique!.mockResolvedValue({ currency: "INR" });
    db.product!.findMany!.mockResolvedValue([]);
});

describe("a row that makes a product", () => {
    it("starts its history, one entry a row, by whoever ran the import", async () => {
        const { entries } = writes();
        await apply([
            "name,price,mrp,gst",
            "Rye loaf,780,1000,5",
            "Plum jam,240,,",
        ]);
        expect(entries()).toEqual([
            {
                action: "price.set",
                actorUserId: "u_asha",
                organizationId: "org_1",
                targetType: "product",
                targetId: "p_rye-loaf",
                outcome: "SUCCESS",
                metadata: {
                    kind: "PRODUCT",
                    name: "Rye loaf",
                    currency: "INR",
                    source: "import",
                    changes: [
                        { field: "price", before: null, after: "780.00" },
                        { field: "mrp", before: null, after: "1000.00" },
                        { field: "gstRate", before: null, after: "5" },
                    ],
                },
            },
            expect.objectContaining({
                action: "price.set",
                targetId: "p_plum-jam",
                metadata: expect.objectContaining({
                    name: "Plum jam",
                    source: "import",
                    changes: [
                        { field: "price", before: null, after: "240.00" },
                    ],
                }),
            }),
        ]);
    });
});

describe("a row that updates a product", () => {
    const existing = (over: Record<string, unknown> = {}) => {
        db.product!.findMany!.mockResolvedValue([
            {
                slug: "rye-loaf",
                mrp: decimal("1000"),
                gstRate: decimal("5"),
                gstPriceMode: null,
                currency: "INR",
                variants: [],
            },
        ]);
        return {
            id: "p_1",
            currency: "INR",
            price: decimal("780"),
            mrp: decimal("1000"),
            gstRate: decimal("5.00"),
            gstPriceMode: null,
            ...over,
        };
    };

    it("records what the row moved, before and after", async () => {
        const { tx, entries } = writes();
        tx.product.findUniqueOrThrow.mockResolvedValue(existing());
        await apply(["name,price,mrp,gst", "Rye loaf,820,1100,18"], "UPDATE");
        expect(tx.product.update).toHaveBeenCalledTimes(1);
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
                    source: "import",
                    changes: [
                        { field: "price", before: "780.00", after: "820.00" },
                        { field: "mrp", before: "1000.00", after: "1100.00" },
                        { field: "gstRate", before: "5", after: "18" },
                    ],
                },
            }),
        ]);
    });

    it("a blank MRP or rate cell leaves that one as it was: no change", async () => {
        const { tx, entries } = writes();
        tx.product.findUniqueOrThrow.mockResolvedValue(existing());
        await apply(["name,price,mrp,gst", "Rye loaf,820,,"], "UPDATE");
        expect(entries()).toHaveLength(1);
        expect(entries()[0]!.metadata).toMatchObject({
            changes: [{ field: "price", before: "780.00", after: "820.00" }],
        });
    });

    it("keeps nothing for a row that moves nothing about the cost", async () => {
        const { tx, entries } = writes();
        tx.product.findUniqueOrThrow.mockResolvedValue(existing());
        await apply(["name,price,mrp,gst", "Rye loaf,780.00,1000,5"], "UPDATE");
        expect(tx.product.update).toHaveBeenCalledTimes(1);
        expect(entries()).toEqual([]);
    });

    it("keeps nothing when the row's write fails", async () => {
        const { tx, entries } = writes();
        tx.product.findUniqueOrThrow.mockResolvedValue(existing());
        tx.product.update.mockRejectedValue(new Error("the database went"));
        await expect(
            apply(["name,price,mrp,gst", "Rye loaf,820,1100,18"], "UPDATE"),
        ).rejects.toThrow("the database went");
        expect(entries()).toEqual([]);
    });
});

describe("a row that is refused", () => {
    it("is never written, and keeps nothing", async () => {
        db.businessProfile!.findUnique!.mockResolvedValue({
            gstRegistered: true,
            gstState: "29",
            taxId: "29AAGCR4375J1ZU",
            gstPriceMode: "ADDED",
        });
        const { tx, entries } = writes();
        // 1,000 + 18% = 1,180, above an MRP of 1,100.
        const result = await apply([
            "name,price,mrp,gst",
            "Face cream,1000,1100,18",
            "Hair oil,1000,1180,18",
        ]);
        expect(result).toMatchObject({ created: 1, failed: 1 });
        expect(tx.product.create).toHaveBeenCalledTimes(1);
        expect(entries()).toHaveLength(1);
        expect(entries()[0]!.metadata).toMatchObject({ name: "Hair oil" });
    });
});
