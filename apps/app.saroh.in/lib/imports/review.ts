import { joinFacts } from "@/lib/format/join";
import { formatMoneyMajor } from "@/lib/format/money";
import { count, plural } from "@/lib/format/plural";

import { fieldLabel } from "./labels";
import type { ImportEntity, ImportPlan, IssueGroup } from "./service";

/**
 * The words the import screen reads its file and plan in. Pure, so each is
 * tested on its own (review.test.ts); the screen only lays them out.
 */

/** What one row of each import is, for counts: "3 products added". */
export function entityNoun(entity: ImportEntity): string {
    return entity === "products" ? "product" : "customer";
}

/** "Name and Price are needed. The rest is optional." */
export function neededSentence(
    required: readonly string[],
    labels: Readonly<Record<string, string>> | undefined,
): string {
    const words = required.map((f) => fieldLabel(labels, f));
    const list = new Intl.ListFormat("en", { type: "conjunction" }).format(
        words,
    );
    return `${list} ${plural(words.length, "is", "are")} needed. The rest is optional.`;
}

/**
 * The columns a file may have, required first, each in a short word: a
 * label that explains itself ("Status: Draft, Live or Archived") is cut at
 * its colon here.
 */
export function columnWords(
    required: readonly string[],
    mappable: readonly string[],
    labels: Readonly<Record<string, string>> | undefined,
): { required: string[]; optional: string[] } {
    const word = (f: string) => fieldLabel(labels, f).split(":")[0].trim();
    return {
        required: required.map(word),
        optional: mappable.filter((f) => !required.includes(f)).map(word),
    };
}

/** A field as the column chooser lists it: optional ones are marked. */
export function fieldOption(
    field: string,
    required: readonly string[],
    labels: Readonly<Record<string, string>> | undefined,
): string {
    const label = fieldLabel(labels, field);
    return required.includes(field) ? label : `${label} (optional)`;
}

/** What a row that's already there matches on, as the merchant thinks of it. */
export function matchNote(
    entity: ImportEntity,
    mapping: Readonly<Record<string, string>>,
): string {
    if (entity === "customers") {
        return "A row matches a customer with the same email.";
    }
    return Object.values(mapping).includes("slug")
        ? "A row matches a product with the same path."
        : "A row matches a product with the same name.";
}

/** "Row 2 in your file", "Rows 4 and 5 in your file", "Rows 2, 3, 4 and 9 more…". */
export function rowsInFile(rows: readonly number[], most = 6): string {
    if (rows.length === 1) return `Row ${rows[0]} in your file`;
    const shown = rows.slice(0, most).map(String);
    const more = rows.length - shown.length;
    const list =
        more > 0
            ? `${shown.join(", ")} and ${count(more, "more", "more")}`
            : new Intl.ListFormat("en", { type: "conjunction" }).format(shown);
    return `Rows ${list} in your file`;
}

/**
 * The plan's problems, one per kind. An API from before grouping sends none
 * grouped; each row's problem is then its own line.
 */
export function issueGroups(plan: ImportPlan | null | undefined): IssueGroup[] {
    if (!plan) return [];
    if (plan.issueGroups) return plan.issueGroups;
    return plan.rows.flatMap((r) =>
        r.issues.map((i) => ({
            ...(i.field ? { field: i.field } : {}),
            message: i.message,
            rows: [i.row],
        })),
    );
}

/**
 * The line above the problems: "the rest" only when there is a rest.
 * `passing` is how many rows will still come in.
 */
export function problemsLead(passing: number): string {
    return passing > 0
        ? `The other ${count(passing, "row")} can still come in. Fix these in your file and import it again.`
        : "Fix these in your file and choose it again.";
}

const STATUS_WORDS: Readonly<Record<string, string>> = {
    DRAFT: "Draft",
    PUBLISHED: "Live",
    ARCHIVED: "Archived",
};

/**
 * One planned row as it will read once it's in: "Kraft Tape 48mm · ₹120 ·
 * MRP ₹150 · GST 18% · Draft" for a product (a product without a status
 * starts as Draft); "Priya Sharma · priya@example.com" for a customer.
 */
export function rowLine(
    entity: ImportEntity,
    values: Partial<Record<string, string>>,
    currency: string | null | undefined,
): string {
    if (entity === "customers") {
        const name =
            values.name ??
            ([values.firstName, values.lastName].filter(Boolean).join(" ") ||
                null);
        return joinFacts(name, values.email, values.phone);
    }
    const money = (v: string | undefined) =>
        v === undefined ? null : formatMoneyMajor(v, currency ?? "INR");
    const status = values.status ?? "DRAFT";
    return joinFacts(
        values.name,
        money(values.price),
        values.mrp === undefined ? null : `MRP ${money(values.mrp)}`,
        values.gstRate === undefined ? null : `GST ${values.gstRate}%`,
        STATUS_WORDS[status] ?? status,
    );
}

/** A sample file's text: cells with a comma, quote or line break quoted. */
export function toCsv(rows: readonly (readonly string[])[]): string {
    const cell = (value: string) =>
        /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    return `${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}
