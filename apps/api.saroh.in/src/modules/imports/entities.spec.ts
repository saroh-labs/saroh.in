import "reflect-metadata";

import {
    ENTITY_DESCRIPTORS,
    isImportEntity,
    normalizeMoney,
    normalizeStatus,
    splitFullName,
} from "./entities";
import { buildImportPlan, suggestMapping } from "./import-plan";

const products = ENTITY_DESCRIPTORS.products;
const customers = ENTITY_DESCRIPTORS.customers;

describe("isImportEntity", () => {
    it("accepts known entities and rejects anything else", () => {
        expect(isImportEntity("products")).toBe(true);
        expect(isImportEntity("customers")).toBe(true);
        expect(isImportEntity("orders")).toBe(false);
        expect(isImportEntity("__proto__")).toBe(false);
    });
});

describe("products descriptor", () => {
    it("derives the key from an explicit slug", () => {
        expect(
            products.keyOf({ name: "Oak Chair", slug: "oak-chair-v2" }),
        ).toBe("oak-chair-v2");
    });

    it("falls back to slugifying the name, as ProductsService.create does", () => {
        expect(products.keyOf({ name: "Oak Chair" })).toBe("oak-chair");
    });

    it("returns null when no slug can be derived", () => {
        expect(products.keyOf({ name: "" })).toBeNull();
        expect(products.keyOf({ name: "!!!" })).toBeNull();
    });

    it("accepts a valid row", () => {
        expect(products.validateRow({ name: "Chair", price: "20.00" })).toEqual(
            [],
        );
    });

    it("rejects a non-numeric price in the merchant's words", () => {
        const issues = products.validateRow({ name: "Chair", price: "twenty" });
        expect(issues).toEqual([
            { field: "price", message: "Price isn't a number." },
        ]);
    });

    it("rejects more than two decimal places", () => {
        expect(
            products.validateRow({ name: "Chair", price: "20.005" }),
        ).toEqual([
            { field: "price", message: "Price has more than 2 decimals." },
        ]);
    });

    it("says a price below 0 is one, not that it isn't a number", () => {
        expect(products.validateRow({ name: "Chair", price: "-5" })).toEqual([
            { field: "price", message: "Price can't be less than 0." },
        ]);
        expect(
            products.validateRow({ name: "Chair", price: "5", mrp: "-1" }),
        ).toEqual([{ field: "mrp", message: "MRP can't be less than 0." }]);
    });

    it("names the statuses it takes, and the one it was given", () => {
        expect(
            products.validateRow({
                name: "Chair",
                price: "5",
                status: "pending",
            }),
        ).toEqual([
            {
                field: "status",
                message:
                    "Status is Draft, Live or Archived. 'pending' isn't one.",
            },
        ]);
    });

    it("says a too-long field in words, never the developer's", () => {
        const issues = products.validateRow({
            name: "Chair",
            price: "5",
            description: "x".repeat(5001),
        });
        expect(issues).toEqual([
            {
                field: "description",
                message: "Description is longer than 5000 characters.",
            },
        ]);
    });

    it("rejects a missing name via the DTO", () => {
        const issues = products.validateRow({ price: "20.00" });
        expect(issues.some((i) => i.field === "name")).toBe(true);
    });

    it("rejects a slug with illegal characters", () => {
        const issues = products.validateRow({
            name: "Chair",
            price: "20.00",
            slug: "Oak Chair!",
        });
        expect(issues).toEqual([
            {
                field: "slug",
                message:
                    "Path uses only lower-case letters, numbers and hyphens.",
            },
        ]);
    });
});

describe("products: a spreadsheet's way of writing values", () => {
    it("takes status in any case, and the words other tools use", () => {
        expect(normalizeStatus(" draft ")).toBe("DRAFT");
        expect(normalizeStatus("DRAFT")).toBe("DRAFT");
        expect(normalizeStatus("Live")).toBe("PUBLISHED");
        expect(normalizeStatus("active")).toBe("PUBLISHED");
        expect(normalizeStatus("Published")).toBe("PUBLISHED");
        expect(normalizeStatus("Archived")).toBe("ARCHIVED");
        expect(normalizeStatus("hidden")).toBe("ARCHIVED");
        expect(normalizeStatus(" pending ")).toBe("pending");
    });

    it("takes the rupee sign and thousands commas off an amount", () => {
        expect(normalizeMoney("₹1,299")).toBe("1299");
        expect(normalizeMoney("₹ 1,20,000.50")).toBe("120000.50");
        expect(normalizeMoney("Rs. 450")).toBe("450");
        expect(normalizeMoney("INR 1,234,567")).toBe("1234567");
        expect(normalizeMoney(" 99 ")).toBe("99");
        expect(normalizeMoney("450/-")).toBe("450");
        // A comma that isn't a thousands one is left for the check to name.
        expect(normalizeMoney("1,5")).toBe("1,5");
    });

    it("plans a lower-case-status file with rupee amounts as ready", () => {
        const plan = buildImportPlan({
            records: [
                { Name: "Kraft Tape 48mm", Price: "₹120", Status: "draft" },
                { Name: "Bubble Wrap", Price: "1,450", Status: "Live" },
                { Name: "Gloves", Price: "80", Status: "hidden" },
            ],
            mapping: { Name: "name", Price: "price", Status: "status" },
            policy: "SKIP",
            existingKeys: new Set(),
            requiredFields: products.requiredFields,
            fieldLabels: products.fieldLabels,
            normalize: products.normalize,
            keyOf: products.keyOf,
            validateRow: products.validateRow,
        });
        expect(plan.counts).toMatchObject({ CREATE: 3, ERROR: 0 });
        expect(plan.rows.map((r) => [r.values.price, r.values.status])).toEqual(
            [
                ["120", "DRAFT"],
                ["1450", "PUBLISHED"],
                ["80", "ARCHIVED"],
            ],
        );
    });

    it("doesn't offer currency: a business sells in one", () => {
        expect(products.mappableFields).not.toContain("currency");
    });
});

describe("sample files", () => {
    for (const [entity, d] of Object.entries(ENTITY_DESCRIPTORS)) {
        it(`${entity}: every heading is matched, and the example rows pass`, () => {
            const [headers, ...rows] = d.sample;
            const mapping = suggestMapping(
                headers,
                d.mappableFields,
                d.aliases,
            );
            expect(Object.keys(mapping)).toEqual([...headers]);
            for (const field of d.requiredFields) {
                expect(Object.values(mapping)).toContain(field);
            }
            const plan = buildImportPlan({
                records: rows.map((cells) =>
                    Object.fromEntries(headers.map((h, i) => [h, cells[i]])),
                ),
                mapping,
                policy: "SKIP",
                existingKeys: new Set(),
                requiredFields: d.requiredFields,
                fieldLabels: d.fieldLabels,
                normalize: d.normalize,
                keyOf: d.keyOf,
                validateRow: d.validateRow,
            });
            expect(plan.issueGroups).toEqual([]);
            expect(plan.counts.CREATE).toBe(rows.length);
        });
    }
});

describe("customers descriptor", () => {
    it("normalizes the key to lowercase, matching @@unique([storeId, email])", () => {
        expect(customers.keyOf({ email: "  Priya@Example.COM " })).toBe(
            "priya@example.com",
        );
    });

    it("returns null with no email", () => {
        expect(customers.keyOf({})).toBeNull();
    });

    it("accepts a valid row", () => {
        expect(customers.validateRow({ email: "priya@example.com" })).toEqual(
            [],
        );
    });

    it("rejects a malformed email using the DTO's own message", () => {
        const issues = customers.validateRow({ email: "not-an-email" });
        expect(issues[0].field).toBe("email");
        expect(issues[0].message).toMatch(/valid email/);
    });

    it("rejects an over-long name", () => {
        const issues = customers.validateRow({
            email: "a@b.com",
            firstName: "x".repeat(101),
        });
        expect(issues.some((i) => i.field === "firstName")).toBe(true);
    });
});

describe("human labels and the full name (UX-065)", () => {
    it("labels every mappable field in words", () => {
        for (const d of [products, customers]) {
            for (const field of d.mappableFields) {
                expect(d.fieldLabels[field]).toMatch(/^[A-Z]/);
            }
        }
        expect(customers.fieldLabels.zipCode).toBe("Postcode / PIN");
        expect(products.keyLabel).toBe("the product's name");
        expect(products.fieldLabels.status).toBe(
            "Status: Draft, Live or Archived",
        );
    });

    it("splits a full name into first and last", () => {
        expect(
            splitFullName({ name: "  Asha  Rani Verma ", email: "a@x.test" }),
        ).toEqual({
            email: "a@x.test",
            firstName: "Asha",
            lastName: "Rani Verma",
        });
        expect(splitFullName({ name: "Asha" })).toEqual({ firstName: "Asha" });
    });

    it("never lets the full name overwrite first and last name", () => {
        expect(splitFullName({ name: "A B", firstName: "Asha" })).toEqual({
            firstName: "Asha",
        });
    });

    it("refuses a GST rate GST doesn't have, on its own field", () => {
        const issues = products.validateRow({
            name: "Chair",
            price: "20.00",
            gstRate: "7",
        });
        expect(issues).toEqual([
            expect.objectContaining({
                field: "gstRate",
                message: expect.stringContaining("7% is not a GST rate"),
            }),
        ]);
        expect(
            products.validateRow({
                name: "Chair",
                price: "20.00",
                gstRate: "18",
                mrp: "25.00",
            }),
        ).toEqual([]);
    });
});
