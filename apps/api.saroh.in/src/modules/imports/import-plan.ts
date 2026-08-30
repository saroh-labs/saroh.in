/**
 * Import planning (#175) — the PURE core of CSV import.
 *
 * Deliberately free of Nest DI, Prisma and the request (the same discipline as
 * `orders/order-state.ts`), so the rules that decide what an import will DO are
 * trivially unit-testable and can never be scattered as ad-hoc checks across
 * handlers.
 *
 * `PRODUCT_STRATEGY.md` §15 requires preview, validation, useful error
 * messages, duplicate handling and a safe correction path. Preview is only
 * honest if the plan is computed by exactly the code that later executes it —
 * so the service builds a plan here, shows it, and then applies THAT plan.
 * Nothing re-decides at write time.
 *
 * Two kinds of duplicate exist and they are not the same problem:
 *   - against the DATABASE — the row collides with something already stored
 *   - within the FILE itself — two rows in one upload share a key
 * A spreadsheet exported from another system routinely contains the second, and
 * silently letting the later row win is how an import quietly loses data.
 */

/**
 * Mapped values for one row.
 *
 * `Partial` is load-bearing, not decoration: a CSV row may omit any column, so
 * reading a field genuinely can yield undefined. Typing this as
 * `Record<string, string>` would let the compiler believe every field is
 * present and quietly delete the guards that handle absence.
 */
export type ImportValues = Partial<Record<string, string>>;

/** What to do when an incoming row collides with an existing record. */
export type DuplicatePolicy = "SKIP" | "UPDATE";

/** What will happen to one row when the plan is applied. */
export type RowOutcome = "CREATE" | "UPDATE" | "SKIP" | "ERROR";

/** A problem with one row, named precisely enough to fix in a spreadsheet. */
export interface RowIssue {
    /** 1-based line number as the merchant sees it, header excluded. */
    row: number;
    /** The mapped field, when the problem belongs to one. */
    field?: string;
    message: string;
}

export interface PlannedRow {
    row: number;
    outcome: RowOutcome;
    /** Natural key this row resolves to — slug for products, email for customers. */
    key: string | null;
    values: ImportValues;
    issues: RowIssue[];
}

export interface ImportPlan {
    totalRows: number;
    counts: Record<RowOutcome, number>;
    rows: PlannedRow[];
    /** Problems that belong to the file rather than to any single row. */
    fileIssues: RowIssue[];
}

export interface PlanInput {
    /** Parsed records, header row already consumed. */
    records: ImportValues[];
    /** CSV header -> domain field. Headers absent here are ignored, not errors. */
    mapping: Record<string, string>;
    policy: DuplicatePolicy;
    /** Natural keys already stored, so a collision is known before writing. */
    existingKeys: ReadonlySet<string>;
    /** Domain fields without which a row cannot be written at all. */
    requiredFields: readonly string[];
    /**
     * Natural key for a row's mapped values, or null when it cannot be derived
     * (a product with no name yields no slug). Returning null is not an error
     * on its own — the required-field check reports the underlying cause.
     */
    keyOf: (values: ImportValues) => string | null;
    /** Domain validation, normally the create DTO's own class-validator rules. */
    validateRow: (values: ImportValues) => Omit<RowIssue, "row">[];
}

const EMPTY_COUNTS = (): Record<RowOutcome, number> => ({
    CREATE: 0,
    UPDATE: 0,
    SKIP: 0,
    ERROR: 0,
});

/** Project one CSV record onto domain fields, dropping unmapped columns. */
export function applyMapping(
    record: ImportValues,
    mapping: Record<string, string>,
): ImportValues {
    const values: ImportValues = {};
    for (const [header, field] of Object.entries(mapping)) {
        const raw = record[header];
        if (raw === undefined) continue;
        const trimmed = raw.trim();
        // An empty cell is an absent value, not an empty string: writing "" for
        // an optional field would overwrite real data on an UPDATE.
        if (trimmed !== "") values[field] = trimmed;
    }
    return values;
}

/**
 * Decide what an import will do, without doing any of it.
 *
 * A row is ERROR when it is missing a required field or fails domain
 * validation. Otherwise it is CREATE, or — on collision — UPDATE or SKIP per
 * the policy. A row colliding with an EARLIER row in the same file is always an
 * ERROR regardless of policy: the file contradicts itself, and neither winner
 * is a defensible guess.
 */
export function buildImportPlan(input: PlanInput): ImportPlan {
    const {
        records,
        mapping,
        policy,
        existingKeys,
        requiredFields,
        keyOf,
        validateRow,
    } = input;

    const fileIssues: RowIssue[] = [];
    const mappedFields = new Set(Object.values(mapping));
    for (const field of requiredFields) {
        if (!mappedFields.has(field)) {
            fileIssues.push({
                row: 0,
                field,
                message: `No column is mapped to the required field "${field}"`,
            });
        }
    }

    const rows: PlannedRow[] = [];
    const counts = EMPTY_COUNTS();
    // Keys claimed by earlier rows in THIS file, to catch self-contradiction.
    const seenInFile = new Map<string, number>();

    records.forEach((record, index) => {
        const row = index + 1;
        const values = applyMapping(record, mapping);
        const issues: RowIssue[] = [];

        for (const field of requiredFields) {
            if (values[field] === undefined) {
                issues.push({ row, field, message: `"${field}" is required` });
            }
        }

        if (issues.length === 0) {
            for (const issue of validateRow(values)) {
                issues.push({ ...issue, row });
            }
        }

        const key = issues.length === 0 ? keyOf(values) : null;

        if (key !== null) {
            const earlier = seenInFile.get(key);
            if (earlier !== undefined) {
                issues.push({
                    row,
                    message: `Duplicate of row ${earlier} in this file (both resolve to "${key}")`,
                });
            } else {
                seenInFile.set(key, row);
            }
        }

        let outcome: RowOutcome;
        if (issues.length > 0) {
            outcome = "ERROR";
        } else if (key !== null && existingKeys.has(key)) {
            outcome = policy === "UPDATE" ? "UPDATE" : "SKIP";
        } else {
            outcome = "CREATE";
        }

        counts[outcome] += 1;
        rows.push({ row, outcome, key, values, issues });
    });

    return { totalRows: records.length, counts, rows, fileIssues };
}

/**
 * A row that will actually be written. The narrowed `key` is the point: only
 * CREATE and UPDATE rows are written, and both are guaranteed to have resolved
 * a natural key, so callers need no non-null assertion to use it.
 */
export type WritableRow = PlannedRow & { key: string };

/** The rows an apply step should write, in file order. */
export function writableRows(plan: ImportPlan): WritableRow[] {
    return plan.rows.filter(
        (r): r is WritableRow =>
            (r.outcome === "CREATE" || r.outcome === "UPDATE") &&
            r.key !== null,
    );
}

/**
 * Whether a plan may be applied at all.
 *
 * A file-level problem (an unmapped required column) blocks everything, because
 * every row would fail the same way. Individual row errors do NOT block: §15
 * asks for a correction path, and refusing an entire import over one bad row
 * would force the merchant to fix a spreadsheet blind.
 */
export function isApplicable(plan: ImportPlan): boolean {
    return plan.fileIssues.length === 0 && writableRows(plan).length > 0;
}
