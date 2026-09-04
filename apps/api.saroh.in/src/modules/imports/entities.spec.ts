import { ENTITY_DESCRIPTORS, isImportEntity } from "./entities";

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

    it("rejects a non-numeric price using the DTO's own message", () => {
        const issues = products.validateRow({ name: "Chair", price: "twenty" });
        expect(issues).toHaveLength(1);
        expect(issues[0].field).toBe("price");
        // The message comes from CreateProductDto, not from a copy here.
        expect(issues[0].message).toMatch(/2 decimals/);
    });

    it("rejects more than two decimal places", () => {
        expect(
            products.validateRow({ name: "Chair", price: "20.005" }),
        ).toHaveLength(1);
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
        expect(issues.some((i) => i.field === "slug")).toBe(true);
    });
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
