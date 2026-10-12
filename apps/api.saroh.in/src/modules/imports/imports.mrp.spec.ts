// A product import's preview and apply under "GST is part of MRP" (12 Oct
// 2026): a row whose amount to pay is above its MRP is an error in the
// plan and is never written. Mocked Prisma, no DB; the rule's own cases
// are in `product-mrp.spec.ts`.
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

const MAPPING = {
    name: "name",
    price: "price",
    mrp: "mrp",
    gst: "gstRate",
};

/** Three rows: over its MRP once GST is added, at it, and under it. */
const CSV = [
    "name,price,mrp,gst",
    "Face cream,1000,1100,18",
    "Hair oil,1000,1180,18",
    "Rose soap,1000,1500,18",
    "",
].join("\n");

function business(mode: "INCLUDED" | "ADDED" | null, registered = true) {
    db.businessProfile!.findUnique!.mockResolvedValue({
        gstRegistered: registered,
        gstState: registered ? "29" : null,
        taxId: registered ? "29AAGCR4375J1ZU" : null,
        gstPriceMode: mode,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    db.product!.findMany!.mockResolvedValue([]);
    db.storeSettings!.findUnique!.mockResolvedValue({ currency: "INR" });
    business("ADDED");
});

const preview = () =>
    service.preview("st_1", "u_1", "products", {
        csv: CSV,
        mapping: MAPPING,
        policy: "SKIP",
    });

describe("a product import's preview", () => {
    it("GST is added: the row over its MRP is an error with the sums, and the rest are made", async () => {
        const { plan } = await preview();
        expect(plan.counts).toMatchObject({ CREATE: 2, ERROR: 1 });
        expect(plan.rows.map((r) => r.outcome)).toEqual([
            "ERROR",
            "CREATE",
            "CREATE",
        ]);
        // 1,000 + 180 = 1,180 > 1,100
        expect(plan.rows[0]?.issues).toEqual([
            {
                row: 1,
                field: "mrp",
                message:
                    "With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. Lower the price, raise the MRP, or set this product's price to include GST.",
            },
        ]);
    });

    it("prices include GST, or a business that isn't registered: every row is made", async () => {
        business("INCLUDED");
        expect((await preview()).plan.counts).toMatchObject({
            CREATE: 3,
            ERROR: 0,
        });
        business("ADDED", false);
        expect((await preview()).plan.counts).toMatchObject({
            CREATE: 3,
            ERROR: 0,
        });
    });
});

describe("applying it", () => {
    it("never writes the refused row", async () => {
        const created: string[] = [];
        const tx = {
            product: {
                create: jest.fn((args: { data: { name: string } }) => {
                    created.push(args.data.name);
                    return Promise.resolve({ id: `p_${created.length}` });
                }),
            },
            storeSettings: db.storeSettings,
        };
        transaction.mockImplementation((fn: (client: typeof tx) => unknown) =>
            fn(tx),
        );
        const result = await service.apply("st_1", "u_1", "products", {
            csv: CSV,
            mapping: MAPPING,
            policy: "SKIP",
        });
        expect(result).toMatchObject({ created: 2, failed: 1 });
        expect(created).toEqual(["Hair oil", "Rose soap"]);
    });
});
