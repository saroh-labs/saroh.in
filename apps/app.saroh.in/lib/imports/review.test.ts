import { describe, expect, it } from "vitest";

import {
    columnWords,
    entityNoun,
    fieldOption,
    issueGroups,
    matchNote,
    neededSentence,
    problemsLead,
    rowLine as rawRowLine,
    rowsInFile,
    toCsv,
} from "./review";
import type { ImportPlan } from "./service";

/** The dot is held by no-break spaces; the words are what's checked. */
const plain = (s: string) => s.replace(/\u00a0/g, " ");
const rowLine = (...args: Parameters<typeof rawRowLine>) =>
    plain(rawRowLine(...args));

const LABELS = {
    name: "Name",
    price: "Price",
    status: "Status: Draft, Live or Archived",
    gstRate: "GST rate (%)",
};

describe("before the file", () => {
    it("says what is needed, and that the rest is optional", () => {
        expect(neededSentence(["name", "price"], LABELS)).toBe(
            "Name and Price are needed. The rest is optional.",
        );
        expect(neededSentence(["email"], { email: "Email" })).toBe(
            "Email is needed. The rest is optional.",
        );
    });

    it("lists the columns required first, each in a short word", () => {
        expect(
            columnWords(
                ["name", "price"],
                ["name", "status", "price", "gstRate"],
                LABELS,
            ),
        ).toEqual({
            required: ["Name", "Price"],
            optional: ["Status", "GST rate (%)"],
        });
    });

    it("writes a sample file a spreadsheet opens as written", () => {
        expect(
            toCsv([
                ["Name", "Price", "Description"],
                ["Chai", "180", 'Assam, with "masala"'],
            ]),
        ).toBe(
            'Name,Price,Description\r\nChai,180,"Assam, with ""masala"""\r\n',
        );
    });
});

describe("matching columns", () => {
    it("marks the optional fields, never the required ones", () => {
        expect(fieldOption("price", ["name", "price"], LABELS)).toBe("Price");
        expect(fieldOption("status", ["name", "price"], LABELS)).toBe(
            "Status: Draft, Live or Archived (optional)",
        );
    });

    it("says what a row that's already there matches on", () => {
        expect(matchNote("products", { Title: "name" })).toBe(
            "A row matches a product with the same name.",
        );
        expect(matchNote("products", { Title: "name", URL: "slug" })).toBe(
            "A row matches a product with the same path.",
        );
        expect(matchNote("customers", {})).toBe(
            "A row matches a customer with the same email.",
        );
    });
});

describe("problems", () => {
    it("numbers rows as the spreadsheet does, grouped", () => {
        expect(rowsInFile([2])).toBe("Row 2 in your file");
        expect(rowsInFile([4, 5])).toBe("Rows 4 and 5 in your file");
        expect(rowsInFile([2, 3, 7])).toBe("Rows 2, 3, and 7 in your file");
        expect(rowsInFile([2, 3, 4, 5, 6, 7, 8, 9])).toBe(
            "Rows 2, 3, 4, 5, 6, 7 and 2 more in your file",
        );
    });

    it("says 'the rest' only when some rows still come in", () => {
        expect(problemsLead(3)).toBe(
            "The other 3 rows can still come in. Fix these in your file and import it again.",
        );
        expect(problemsLead(1)).toMatch(/^The other 1 row can/);
        expect(problemsLead(0)).toBe(
            "Fix these in your file and choose it again.",
        );
    });

    it("reads the API's groups, or makes one per problem from an older API", () => {
        const base: ImportPlan = {
            totalRows: 2,
            counts: { CREATE: 0, UPDATE: 0, SKIP: 0, ERROR: 2 },
            fileIssues: [],
            rows: [
                {
                    row: 2,
                    outcome: "ERROR",
                    key: null,
                    values: {},
                    issues: [{ row: 2, field: "price", message: "x" }],
                },
            ],
        };
        expect(issueGroups(base)).toEqual([
            { field: "price", message: "x", rows: [2] },
        ]);
        const grouped = [{ message: "y", rows: [2, 3] }];
        expect(issueGroups({ ...base, issueGroups: grouped })).toBe(grouped);
        expect(issueGroups(null)).toEqual([]);
    });
});

describe("a row as it will read", () => {
    it("reads a product with its amounts, GST and status", () => {
        expect(
            rowLine(
                "products",
                {
                    name: "Kraft Tape 48mm",
                    price: "120",
                    mrp: "150",
                    gstRate: "18",
                    status: "DRAFT",
                },
                "INR",
            ),
        ).toBe("Kraft Tape 48mm · ₹120 · MRP ₹150 · GST 18% · Draft");
    });

    it("says a product with no status starts as Draft, and Live for published", () => {
        expect(rowLine("products", { name: "A", price: "5" }, "INR")).toBe(
            "A · ₹5 · Draft",
        );
        expect(
            rowLine(
                "products",
                { name: "A", price: "5", status: "PUBLISHED" },
                null,
            ),
        ).toBe("A · ₹5 · Live");
    });

    it("reads a customer by name and email", () => {
        expect(
            rowLine(
                "customers",
                { firstName: "Priya", lastName: "Sharma", email: "p@x.in" },
                null,
            ),
        ).toBe("Priya Sharma · p@x.in");
    });

    it("counts in the thing's own word", () => {
        expect(entityNoun("products")).toBe("product");
        expect(entityNoun("customers")).toBe("customer");
    });
});
