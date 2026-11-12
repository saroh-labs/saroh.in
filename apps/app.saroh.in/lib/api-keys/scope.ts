/**
 * What a server key may do, as the New key sheet asks it ("What it can
 * do": a row per area, See and Change) and as a key's row says it
 * ("Catalogue: see and change · Orders and customers: see"). The API
 * keeps a key to its maker's own powers and never past `/v1`'s routes;
 * this is only how those actions are asked and said.
 */

export type ScopeArea =
    "catalogue" | "bookings" | "orders" | "customers" | "enquiries";

export type ScopeLevel = "none" | "see" | "change";

export interface ScopeAreaRow {
    area: ScopeArea;
    label: string;
    see: readonly string[];
    /** Empty where `/v1` has no writes (enquiries). */
    change: readonly string[];
}

export const SCOPE_AREAS: readonly ScopeAreaRow[] = [
    {
        area: "catalogue",
        label: "Catalogue",
        // Posts and subscription plans are read beside the catalogue.
        see: ["store:read", "service:read", "site:read", "subscription:read"],
        change: ["store:write", "service:write", "inventory:write"],
    },
    {
        area: "bookings",
        label: "Bookings",
        see: ["booking:read"],
        change: ["booking:write"],
    },
    {
        area: "orders",
        label: "Orders",
        see: ["order:read"],
        change: ["order:create", "order:edit"],
    },
    {
        area: "customers",
        label: "Customers",
        see: ["contact:read"],
        change: ["contact:write"],
    },
    {
        area: "enquiries",
        label: "Enquiries",
        see: ["lead:read", "form:read"],
        change: [],
    },
];

export type ScopeLevels = Record<ScopeArea, ScopeLevel>;

/** A new key's start: the catalogue to read, nothing else. */
export const NEW_KEY_LEVELS: ScopeLevels = {
    catalogue: "see",
    bookings: "none",
    orders: "none",
    customers: "none",
    enquiries: "none",
};

/** The actions to ask for: Change takes See with it; only what `may` allows. */
export function scopeOf(
    levels: ScopeLevels,
    may: (action: string) => boolean = () => true,
): string[] {
    const out: string[] = [];
    for (const row of SCOPE_AREAS) {
        const level = levels[row.area];
        if (level === "none") continue;
        out.push(...row.see);
        if (level === "change") out.push(...row.change);
    }
    return out.filter(may);
}

/** A key's scope read back into levels: any change action is Change. */
export function levelsOf(scope: readonly string[]): ScopeLevels {
    const has = new Set(scope);
    const levels = { ...NEW_KEY_LEVELS, catalogue: "none" } as ScopeLevels;
    for (const row of SCOPE_AREAS) {
        if (row.change.some((a) => has.has(a))) levels[row.area] = "change";
        else if (row.see.some((a) => has.has(a))) levels[row.area] = "see";
    }
    return levels;
}

function joinAreas(labels: string[]): string {
    const words = labels.map((l, i) => (i === 0 ? l : l.toLowerCase()));
    return words.length < 2
        ? (words[0] ?? "")
        : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** "Catalogue: see and change · Orders and customers: see", then "AI apps". */
export function canDoLine(scope: readonly string[], aiEnabled = false): string {
    const levels = levelsOf(scope);
    const by = (level: ScopeLevel) =>
        SCOPE_AREAS.filter((r) => levels[r.area] === level).map((r) => r.label);
    const parts: string[] = [];
    const change = by("change");
    const see = by("see");
    if (change.length) parts.push(`${joinAreas(change)}: see and change`);
    if (see.length) parts.push(`${joinAreas(see)}: see`);
    if (aiEnabled) parts.push("AI apps");
    return parts.join(" · ") || "Nothing yet";
}

/** A website key's addresses as its row says them: hosts, no scheme. */
export function originsLine(origins: readonly string[]): string {
    return origins.map((o) => o.replace(/^https?:\/\//, "")).join(", ");
}

/** "Works on these websites", one a line, as the API takes them. */
export function originsFrom(text: string): string[] {
    return text
        .split(/[\n,]/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (/^https?:\/\//i.test(line) ? line : `https://${line}`));
}
