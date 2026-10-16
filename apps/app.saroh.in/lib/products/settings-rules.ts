import type {
    CatalogueView,
    DefaultField,
    DefaultsEntry,
    DefaultsSuggestion,
} from "./settings";

/**
 * The Defaults tab's rules, pure and client-safe (tested in
 * `settings-rules.test.ts`): the form a row edits, what changed, how many
 * saved products a save could update, and the words for a suggestion.
 */

/** "" = the same as All products (categories only). */
export type ReturnsChoice = "" | "STOREFRONT" | `OWN:${string}`;

export interface DefaultsRow {
    /** "all" or a category id. */
    key: string;
    name: string;
    howToUse: string;
    /** "" = the same as All products (categories only). */
    low: string;
    returns: ReturnsChoice;
}

/** The rules a merchant picks between, as the design offers them. */
export const RETURN_RULES: { choice: ReturnsChoice; label: string }[] = [
    {
        choice: "OWN:Returnable within 7 days, unused",
        label: "Returnable within 7 days, unused",
    },
    { choice: "STOREFRONT", label: "The location's rule" },
    { choice: "OWN:Non-returnable", label: "Non-returnable" },
];

export const BUILT_IN_LOW = 10;

export function returnsLabel(choice: ReturnsChoice): string {
    if (choice === "") return "Same as All products";
    if (choice === "STOREFRONT") return "The location's rule";
    return choice.slice(4);
}

function choiceOf(entry: DefaultsEntry | undefined): ReturnsChoice {
    if (!entry?.returnsMode) return "";
    if (entry.returnsMode === "STOREFRONT") return "STOREFRONT";
    return `OWN:${entry.returnsText ?? ""}`;
}

export function rowsFrom(view: CatalogueView): DefaultsRow[] {
    const e = view.defaults.entries;
    const all = e.all;
    return [
        {
            key: "all",
            name: "All products",
            howToUse: all?.howToUse ?? "",
            low: String(all?.lowStockAlert ?? BUILT_IN_LOW),
            returns: choiceOf(all) || "STOREFRONT",
        },
        ...view.categories.map((c) => {
            const own = e[c.id];
            return {
                key: c.id,
                name: c.name,
                howToUse: own?.howToUse ?? "",
                low:
                    own?.lowStockAlert === null ||
                    own?.lowStockAlert === undefined
                        ? ""
                        : String(own.lowStockAlert),
                returns: choiceOf(own),
            };
        }),
    ];
}

export function toEntry(row: DefaultsRow): DefaultsEntry & { key: string } {
    const r = row.returns;
    return {
        key: row.key,
        howToUse: row.howToUse.trim() || null,
        lowStockAlert: row.low.trim() === "" ? null : Number(row.low),
        returnsMode:
            r === "" ? null : r === "STOREFRONT" ? "STOREFRONT" : "OWN",
        returnsText: r.startsWith("OWN:") ? r.slice(4) : null,
    };
}

const whole = (v: string) => /^\d+$/.test(v.trim());

const LOW_PROBLEM = "Low stock at is a whole number, zero or more.";

/** "Low stock at is …" when a row's number is not one; "" when all are. */
export function defaultsProblem(rows: DefaultsRow[]): string {
    const bad = rows.some((r) =>
        r.key === "all" ? !whole(r.low) : r.low.trim() !== "" && !whole(r.low),
    );
    return bad ? LOW_PROBLEM : "";
}

export interface Change {
    key: string;
    field: DefaultField;
}

export function changes(rows: DefaultsRow[], base: DefaultsRow[]): Change[] {
    const out: Change[] = [];
    for (const r of rows) {
        const b = base.find((x) => x.key === r.key);
        if (!b) continue;
        if (r.howToUse.trim() !== b.howToUse.trim())
            out.push({ key: r.key, field: "howToUse" });
        if (r.low.trim() !== b.low.trim())
            out.push({ key: r.key, field: "lowStockAlert" });
        if (r.returns !== b.returns) out.push({ key: r.key, field: "returns" });
    }
    return out;
}

/**
 * How many saved products still hold a value that is changing — those Save
 * can update. All products overlaps the categories, so it is never added on
 * top of them: the larger of the two is the honest count.
 */
export function affected(
    changed: Change[],
    stillOnDefault: CatalogueView["defaults"]["stillOnDefault"],
    names: Partial<Record<string, string>>,
): { count: number; where: string } {
    const perKey: Partial<Record<string, number>> = {};
    for (const c of changed) {
        const n = stillOnDefault[c.key]?.[c.field] ?? 0;
        perKey[c.key] = Math.max(perKey[c.key] ?? 0, n);
    }
    const allOnly = perKey.all ?? 0;
    delete perKey.all;
    const cats = Object.entries(perKey).filter(
        (e): e is [string, number] => (e[1] ?? 0) > 0,
    );
    const sum = cats.reduce((n, [, v]) => n + v, 0);
    return {
        count: Math.max(allOnly, sum),
        where: cats.map(([k, n]) => `${names[k] ?? k} ${n}`).join(", "),
    };
}

/**
 * One suggestion, with its denominator said: "All 5 Pune writers that track
 * stock warn at 1." — a warning level is only read from products that track
 * stock, so the count is of those, never of the category's every product.
 */
export function suggestionText(
    s: DefaultsSuggestion,
    categoryName: string,
): string {
    const where = s.key === "all" ? "products" : categoryName;
    if (s.field === "lowStockAlert") {
        return s.count === s.total
            ? `All ${s.total} ${where} that track stock warn at ${s.value}.`
            : `${s.count} of the ${s.total} ${where} that track stock warn at ${s.value}.`;
    }
    return s.count === s.total
        ? `All ${s.total} ${where} say “${s.value}”`
        : `${s.count} of your ${s.total} ${where} say “${s.value}”`;
}

/**
 * The one line the Defaults tab shows for every suggestion at once (one
 * message, not stacked notes): "6 categories usually warn lower than 10."
 * A single suggestion is said in full. "" when there are none.
 */
export function suggestionLine(
    suggestions: DefaultsSuggestion[],
    names: Partial<Record<string, string>>,
    allLow: string,
): string {
    if (suggestions.length === 0) return "";
    if (suggestions.length === 1) {
        const [first] = suggestions as [DefaultsSuggestion];
        return suggestionText(first, names[first.key] ?? "products");
    }
    const keys = new Set(suggestions.map((x) => x.key)).size;
    const one = keys === 1;
    const cats = `${keys} ${one ? "category" : "categories"} usually`;
    const warn = one ? "warns" : "warn";
    const lows = suggestions.filter((x) => x.field === "lowStockAlert");
    const low = Number(allLow);
    if (lows.length === suggestions.length) {
        if (whole(allLow) && lows.every((x) => Number(x.value) < low))
            return `${cats} ${warn} lower than ${low}.`;
        if (whole(allLow) && lows.every((x) => Number(x.value) > low))
            return `${cats} ${warn} higher than ${low}.`;
        return `${cats} ${warn} at a level of ${one ? "its" : "their"} own.`;
    }
    if (lows.length === 0)
        return `${cats} ${one ? "says" : "say"} the same way to use ${one ? "it" : "them"}.`;
    return `${cats} ${one ? "has" : "have"} values of ${one ? "its" : "their"} own.`;
}

/** What a category sets for itself, in a table cell's words; [] for none. */
export function overrides(row: DefaultsRow): string[] {
    const out: string[] = [];
    if (row.low.trim()) out.push(`Low stock at ${row.low.trim()}`);
    if (row.returns) out.push(`Returns: ${returnsLabel(row.returns)}`);
    if (row.howToUse.trim()) out.push(`How to use: ${row.howToUse.trim()}`);
    return out;
}

/** The problem with a row's own Low stock at, or "". */
export function lowProblem(row: DefaultsRow): string {
    const v = row.low.trim();
    if (row.key === "all" ? whole(v) : v === "" || whole(v)) return "";
    return LOW_PROBLEM;
}
