import {
    applyMapping,
    buildImportPlan,
    groupIssues,
    isApplicable,
    suggestMapping,
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

    it("numbers rows as the spreadsheet shows them: the headings are row 1", () => {
        const p = plan({ records: [{ Name: "A" }, { Name: "B" }] });
        expect(p.rows.map((r) => r.row)).toEqual([2, 3]);
    });

    it("errors a row missing a required field, naming the field in words", () => {
        const p = plan({
            records: [{ Price: "10" }],
            fieldLabels: { name: "Name" },
        });
        expect(p.rows[0].outcome).toBe("ERROR");
        expect(p.rows[0].issues[0]).toEqual({
            row: 2,
            field: "name",
            message: "Name is empty.",
        });
    });

    it("judges and writes the normalized values", () => {
        const p = plan({
            records: [{ Name: "Chair", Price: "₹1,299" }],
            normalize: (v) => ({ ...v, price: v.price?.replace(/[₹,]/g, "") }),
            validateRow: (v) =>
                v.price === "1299" ? [] : [{ message: "not normalized" }],
        });
        expect(p.rows[0].outcome).toBe("CREATE");
        expect(p.rows[0].values.price).toBe("1299");
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
            row: 2,
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
        expect(p.rows[1].issues[0].message).toBe("Repeats row 2.");
    });

    it("errors it under UPDATE too — the file contradicts itself", () => {
        // Silently letting the last row win is how an import loses data.
        const p = plan({ records, policy: "UPDATE" });
        expect(p.rows[1].outcome).toBe("ERROR");
    });
});

describe("buildImportPlan — file-level problems", () => {
    it("reports a required field with no column mapped to it, once, in words", () => {
        const p = plan({
            mapping: { Price: "price" },
            records: [{ Price: "1" }, { Price: "2" }, { Price: "3" }],
            fieldLabels: { name: "Name" },
        });
        expect(p.fileIssues).toEqual([
            {
                row: 0,
                field: "name",
                message: "No column is matched to Name. Pick it above.",
            },
        ]);
        // Not repeated on every row: the file's line says it.
        expect(p.rows.every((r) => r.issues.length === 0)).toBe(true);
        expect(p.issueGroups).toEqual([]);
        expect(p.counts.ERROR).toBe(3);
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

describe("suggestMapping", () => {
    const FIELDS = ["name", "price", "firstName", "email"] as const;

    it("matches an exact header", () => {
        expect(suggestMapping(["name", "price"], FIELDS)).toEqual({
            name: "name",
            price: "price",
        });
    });

    it("matches regardless of case, spaces and separators", () => {
        expect(
            suggestMapping(["First Name", "E-Mail", "PRICE"], FIELDS),
        ).toEqual({
            "First Name": "firstName",
            "E-Mail": "email",
            PRICE: "price",
        });
    });

    it("leaves an unrecognised header unmapped rather than guessing", () => {
        // A wrong automatic mapping writes plausible data into the wrong
        // column, which is worse than asking.
        expect(suggestMapping(["Supplier Ref"], FIELDS)).toEqual({});
    });

    it("does not feed one field from two columns", () => {
        const mapping = suggestMapping(["Name", "name"], FIELDS);
        expect(Object.values(mapping)).toEqual(["name"]);
        expect(mapping.Name).toBe("name");
    });

    it("returns an empty mapping for no headers", () => {
        expect(suggestMapping([], FIELDS)).toEqual({});
    });
});

describe("suggestMapping with other headings (UX-065)", () => {
    it("matches a heading by its alias, and never a field that isn't mappable", () => {
        expect(
            suggestMapping(
                ["Full Name", "Pin code", "Mobile"],
                ["name", "zipCode"],
                {
                    fullname: "name",
                    pincode: "zipCode",
                    mobile: "phone",
                },
            ),
        ).toEqual({ "Full Name": "name", "Pin code": "zipCode" });
    });
});

describe("groupIssues — one line per problem", () => {
    it("groups the same problem across rows, in the order first met", () => {
        const p = plan({
            records: [
                { Name: "A", Price: "x" },
                { Name: "B", Price: "1" },
                { Name: "C", Price: "y" },
                { Price: "2" },
            ],
            validateRow: (v) =>
                /^\d+$/.test(v.price ?? "")
                    ? []
                    : [{ field: "price", message: "Price isn't a number." }],
            fieldLabels: { name: "Name" },
        });
        expect(p.issueGroups).toEqual([
            { field: "price", message: "Price isn't a number.", rows: [2, 4] },
            { field: "name", message: "Name is empty.", rows: [5] },
        ]);
        expect(groupIssues(p.rows)).toEqual(p.issueGroups);
    });
});
