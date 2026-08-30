import {
    applyMapping,
    buildImportPlan,
    isApplicable,
    writableRows,
    type PlanInput,
} from "./import-plan";

const MAPPING = { Name: "name", Price: "price", SKU: "slug" };

function plan(over: Partial<PlanInput> = {}) {
    const base: PlanInput = {
        records: [],
        mapping: MAPPING,
        policy: "SKIP",
        existingKeys: new Set<string>(),
        requiredFields: ["name"],
        keyOf: (v) => v.slug ?? v.name?.toLowerCase() ?? null,
        validateRow: () => [],
        ...over,
    };
    return buildImportPlan(base);
}

describe("applyMapping", () => {
    it("keeps only mapped columns", () => {
        expect(
            applyMapping({ Name: "Chair", Notes: "ignore me" }, MAPPING),
        ).toEqual({ name: "Chair" });
    });

    it("trims whitespace", () => {
        expect(applyMapping({ Name: "  Chair  " }, MAPPING)).toEqual({
            name: "Chair",
        });
    });

    it("treats an empty cell as absent, not as an empty string", () => {
        // Critical for UPDATE: writing "" would blank a real stored value.
        expect(applyMapping({ Name: "Chair", Price: "   " }, MAPPING)).toEqual({
            name: "Chair",
        });
        expect("price" in applyMapping({ Price: "" }, MAPPING)).toBe(false);
    });
});

describe("buildImportPlan — outcomes", () => {
    it("plans a clean row as CREATE", () => {
        const p = plan({ records: [{ Name: "Chair" }] });
        expect(p.counts).toMatchObject({ CREATE: 1, ERROR: 0 });
        expect(p.rows[0].outcome).toBe("CREATE");
    });

    it("numbers rows from 1, excluding the header", () => {
        const p = plan({ records: [{ Name: "A" }, { Name: "B" }] });
        expect(p.rows.map((r) => r.row)).toEqual([1, 2]);
    });

    it("errors a row missing a required field, naming the field", () => {
        const p = plan({ records: [{ Price: "10" }] });
        expect(p.rows[0].outcome).toBe("ERROR");
        expect(p.rows[0].issues[0]).toMatchObject({ row: 1, field: "name" });
    });

    it("surfaces domain validation failures against the row", () => {
        const p = plan({
            records: [{ Name: "Chair", Price: "banana" }],
            validateRow: () => [
                { field: "price", message: "Price must be a number" },
            ],
        });
        expect(p.rows[0].outcome).toBe("ERROR");
        expect(p.rows[0].issues[0]).toEqual({
            row: 1,
            field: "price",
            message: "Price must be a number",
        });
    });

    it("does not run domain validation on a row already missing a required field", () => {
        const validateRow = jest.fn().mockReturnValue([]);
        plan({ records: [{ Price: "10" }], validateRow });
        // Piling "price is invalid" onto "name is missing" buries the real fix.
        expect(validateRow).not.toHaveBeenCalled();
    });
});

describe("buildImportPlan — duplicates against the database", () => {
    const records = [{ Name: "Chair", SKU: "chair" }];
    const existingKeys = new Set(["chair"]);

    it("SKIPs a collision under the SKIP policy", () => {
        const p = plan({ records, existingKeys, policy: "SKIP" });
        expect(p.rows[0].outcome).toBe("SKIP");
        expect(p.counts).toMatchObject({ SKIP: 1, CREATE: 0 });
    });

    it("UPDATEs a collision under the UPDATE policy", () => {
        const p = plan({ records, existingKeys, policy: "UPDATE" });
        expect(p.rows[0].outcome).toBe("UPDATE");
        expect(p.counts).toMatchObject({ UPDATE: 1, CREATE: 0 });
    });

    it("CREATEs when the key is absent from the database", () => {
        const p = plan({ records, existingKeys: new Set(["stool"]) });
        expect(p.rows[0].outcome).toBe("CREATE");
    });
});

describe("buildImportPlan — duplicates within the file", () => {
    const records = [
        { Name: "Chair", SKU: "chair" },
        { Name: "Chair again", SKU: "chair" },
    ];

    it("errors the later row and names the earlier one", () => {
        const p = plan({ records });
        expect(p.rows[0].outcome).toBe("CREATE");
        expect(p.rows[1].outcome).toBe("ERROR");
        expect(p.rows[1].issues[0].message).toContain("row 1");
    });

    it("errors it under UPDATE too — the file contradicts itself", () => {
        // Silently letting the last row win is how an import loses data.
        const p = plan({ records, policy: "UPDATE" });
        expect(p.rows[1].outcome).toBe("ERROR");
    });
});

describe("buildImportPlan — file-level problems", () => {
    it("reports a required field with no column mapped to it", () => {
        const p = plan({
            mapping: { Price: "price" },
            records: [{ Price: "1" }],
        });
        expect(p.fileIssues[0]).toMatchObject({ field: "name" });
    });

    it("blocks apply when the file itself is unusable", () => {
        const p = plan({
            mapping: { Price: "price" },
            records: [{ Price: "1" }],
        });
        expect(isApplicable(p)).toBe(false);
    });
});

describe("writableRows / isApplicable", () => {
    const records = [
        { Name: "Chair", SKU: "chair" }, // CREATE
        { Price: "10" }, // ERROR — no name
        { Name: "Desk", SKU: "desk" }, // collides
    ];
    const existingKeys = new Set(["desk"]);

    it("returns only rows that will be written", () => {
        const p = plan({ records, existingKeys, policy: "UPDATE" });
        expect(writableRows(p).map((r) => r.outcome)).toEqual([
            "CREATE",
            "UPDATE",
        ]);
    });

    it("excludes SKIPped rows from the write set", () => {
        const p = plan({ records, existingKeys, policy: "SKIP" });
        expect(writableRows(p).map((r) => r.outcome)).toEqual(["CREATE"]);
    });

    it("still applies when some rows failed — a bad row must not block the file", () => {
        // §15 asks for a correction path; refusing everything over one bad row
        // forces the merchant to fix a spreadsheet blind.
        const p = plan({ records, existingKeys });
        expect(p.counts.ERROR).toBe(1);
        expect(isApplicable(p)).toBe(true);
    });

    it("does not apply when there is nothing to write", () => {
        const p = plan({ records: [{ Price: "10" }] });
        expect(isApplicable(p)).toBe(false);
    });
});
