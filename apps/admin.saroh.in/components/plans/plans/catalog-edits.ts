import type {
    Catalog,
    CatalogModule,
    Cell,
    IncludedCell,
    Plan,
} from "@saroh/pricing-catalog";
import { cellOf, formatCount } from "@saroh/pricing-catalog";

import type { ModuleUsage } from "@/lib/pricing-types";

/**
 * The Plans and Modules tabs' rules, pure (plans catalogue U7, U8): what
 * counts as changed from live, how a cell is ticked on and off, how money
 * and limits are read from what the operator types, where a validation
 * message belongs, and the design's add, move and regroup moves. Each
 * mutating helper changes the catalogue it is handed, so a tab calls it
 * inside `edit(c => …)` and nowhere else.
 */

// ── Changed from live ─────────────────────────────────────────────────────

/** Two cells say the same thing (field by field, not key order). */
export function sameCell(a: Cell, b: Cell): boolean {
    if (a.inc !== b.inc) return false;
    if (!a.inc || !b.inc) {
        return !a.inc && !b.inc && a.off === b.off;
    }
    return (
        a.text === b.text &&
        a.card === b.card &&
        a.limit === b.limit &&
        a.per === b.per &&
        a.soft === b.soft
    );
}

/** The live cell, or null when the module isn't live at all. */
export function liveCellOf(
    live: Catalog | null,
    moduleId: string,
    planId: string,
): Cell | null {
    const m = live?.modules.find((x) => x.id === moduleId);
    return m ? cellOf(m, planId) : null;
}

/** A cell differs from live (a module or plan that isn't live always does). */
export function cellChanged(
    live: Catalog | null,
    module: CatalogModule,
    planId: string,
): boolean {
    if (!live) return false;
    const lc = liveCellOf(live, module.id, planId);
    if (!lc || !live.plans.some((p) => p.id === planId)) return true;
    return !sameCell(lc, cellOf(module, planId));
}

function samePlan(a: Plan, b: Plan): boolean {
    return (
        a.name === b.name &&
        a.pricePaise === b.pricePaise &&
        a.tagline === b.tagline &&
        a.cta === b.cta &&
        a.featured === b.featured &&
        a.retired === b.retired &&
        (a.trial?.on ?? false) === (b.trial?.on ?? false) &&
        (a.trial?.days ?? null) === (b.trial?.days ?? null)
    );
}

/** The plan chip's dot: the plan or any of its cells differs from live. */
export function planChanged(
    live: Catalog | null,
    catalog: Catalog,
    planId: string,
): boolean {
    if (!live) return false;
    const now = catalog.plans.find((p) => p.id === planId);
    const was = live.plans.find((p) => p.id === planId);
    if (!now) return false;
    if (!was || !samePlan(was, now)) return true;
    return catalog.modules.some((m) => cellChanged(live, m, planId));
}

export function isNewModule(live: Catalog | null, moduleId: string): boolean {
    return !!live && !live.modules.some((m) => m.id === moduleId);
}

// ── Cells ─────────────────────────────────────────────────────────────────

/**
 * Ticking a module on for a plan. Live's own words come back when live
 * had it included; otherwise it starts as "Included", as the design does.
 */
export function includedCell(liveCell: Cell | null): IncludedCell {
    if (liveCell?.inc) return { ...liveCell };
    return {
        inc: true,
        text: "Included",
        card: "",
        limit: null,
        per: "",
        soft: false,
    };
}

/** Ticking it off: live's Locked or Hidden when live had it off, else Locked. */
export function excludedCell(liveCell: Cell | null): Cell {
    return liveCell && !liveCell.inc
        ? { inc: false, off: liveCell.off }
        : { inc: false, off: "locked" };
}

/** Change one cell of a module, in place. */
export function setCell(
    catalog: Catalog,
    moduleId: string,
    planId: string,
    next: Cell,
): void {
    const m = catalog.modules.find((x) => x.id === moduleId);
    if (m) m.cells[planId] = next;
}

/**
 * Patch an included cell; does nothing to an excluded one. Clearing the
 * limit clears "soft" too: a soft cap without a cap is a setting nobody can
 * see or change.
 */
export function patchIncluded(
    catalog: Catalog,
    moduleId: string,
    planId: string,
    patch: Partial<Omit<IncludedCell, "inc">>,
): void {
    const m = catalog.modules.find((x) => x.id === moduleId);
    if (!m) return;
    const c = cellOf(m, planId);
    if (!c.inc) return;
    const next = { ...c, ...patch };
    if (next.limit == null) next.soft = false;
    m.cells[planId] = next;
}

/** "123 a month", as the matrix cell says it after "Limit". */
export function limitWords(cell: Cell): string | null {
    if (!cell.inc || cell.limit == null) return null;
    return formatCount(cell.limit) + (cell.per === "month" ? " a month" : "");
}

// ── Typed numbers ─────────────────────────────────────────────────────────

const RUPEES = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

/**
 * Rupees as typed, to paise, without float maths: "499" is 49 900, "499.5"
 * is 49 950. Null for anything else (a minus, letters, three decimals).
 */
export function parseRupees(text: string): number | null {
    const m = RUPEES.exec(text.trim());
    if (!m) return null;
    const whole = Number(m[1]);
    const part = Number((m.at(2) ?? "").padEnd(2, "0"));
    return whole * 100 + part;
}

/** Paise as the price field shows it: whole rupees, two decimals only for paise. */
export function rupeesText(paise: number): string {
    const whole = Math.floor(paise / 100);
    const part = paise % 100;
    return part ? `${whole}.${String(part).padStart(2, "0")}` : String(whole);
}

/**
 * A limit as typed: blank is no cap (null); a whole number above 0 is the
 * cap; anything else is refused (undefined).
 */
export function parseLimit(text: string): number | null | undefined {
    const t = text.trim();
    if (t === "") return null;
    if (!/^\d{1,9}$/.test(t)) return undefined;
    const n = Number(t);
    return n > 0 ? n : undefined;
}

export const PRICE_HINT = "Enter rupees, like 499 or 499.50";
export const LIMIT_HINT = "A whole number above 0, or blank for no limit";

// ── Validation messages beside their fields ───────────────────────────────

/**
 * `validateCatalog`'s messages by where they belong ("plans.1.name"), in
 * the operator's words. A message without a path is keyed "".
 */
export function errorsByPath(errors: readonly string[]): Map<string, string> {
    const out = new Map<string, string>();
    for (const e of errors) {
        const m = /^([A-Za-z0-9_.-]+): (.*)$/.exec(e);
        const path = m?.[1] ?? "";
        const message = readable(m?.[2] ?? e);
        if (!out.has(path)) out.set(path, message);
    }
    return out;
}

function readable(message: string): string {
    if (message.startsWith("String must contain at least 1 character")) {
        return "This can't be blank";
    }
    return message;
}

// ── Plans ─────────────────────────────────────────────────────────────────

/** An id the schema accepts and nothing in `taken` uses. */
export function freshId(
    prefix: "p" | "m",
    taken: readonly string[],
    now: number = Date.now(),
): string {
    let n = now;
    let id = prefix + n.toString(36);
    while (taken.includes(id)) id = prefix + (++n).toString(36);
    return id;
}

/** "+ Plan": a new free plan with the design's defaults. Returns its id. */
export function addPlan(catalog: Catalog, now?: number): string {
    const id = freshId(
        "p",
        catalog.plans.map((p) => p.id),
        now,
    );
    catalog.plans.push({
        id,
        name: "New plan",
        pricePaise: 0,
        tagline: "",
        cta: "Choose plan",
        featured: false,
        retired: false,
    });
    return id;
}

/** "Highlight this card" / "Remove highlight": one highlighted plan at most. */
export function toggleFeatured(catalog: Catalog, planId: string): void {
    const on = !catalog.plans.find((p) => p.id === planId)?.featured;
    for (const p of catalog.plans) p.featured = p.id === planId ? on : false;
}

/** The plan the Plans tab opens on: the highlighted one, else the first. */
export function defaultPlanId(catalog: Catalog): string | null {
    const offered = catalog.plans.filter((p) => !p.retired);
    return (
        offered.find((p) => p.featured)?.id ??
        offered.at(0)?.id ??
        catalog.plans.at(0)?.id ??
        null
    );
}

// ── Usage ─────────────────────────────────────────────────────────────────

/**
 * The line under a module row. Recounted from each business's count as the
 * limit is typed (the API's `moduleUsage` rule); the API's own line when
 * the module isn't counted; nothing when there's nothing true to say.
 */
export function usageLine(
    usage: ModuleUsage | undefined,
    planName: string,
    cell: Cell,
): string | null {
    if (!usage) return null;
    if (!usage.measured || !usage.values) return usage.line;
    const values = usage.values;
    if (!values.length) return `Nobody on ${planName} yet`;
    const using = values.filter((u) => u > 0).length;
    if (!using) return `Nobody on ${planName} uses it`;
    const limit = cell.inc ? cell.limit : null;
    const highest = Math.max(...values);
    let line = `${using} of ${values.length} use it`;
    if (limit != null || highest > 1)
        line += ` · highest ${formatCount(highest)}`;
    if (limit != null) {
        const over = values.filter((u) => u > limit).length;
        const near = values.filter(
            (u) => u >= 0.8 * limit && u <= limit,
        ).length;
        if (over) line += ` · ${over} over the limit`;
        else if (near) line += ` · ${near} at 80%+`;
    }
    return line;
}

// ── Modules ───────────────────────────────────────────────────────────────

/** The dashboard rail entries a module can lock, as the menu names them. */
const MENU_LABELS: Record<string, string> = {
    website: "Website",
    sell: "Sell",
    bookingsx: "Bookings",
    paymentsx: "Payments",
};

export function menuLabel(menu: string): string {
    return MENU_LABELS[menu] ?? menu.charAt(0).toUpperCase() + menu.slice(1);
}

/** The matrix's line under a module's name. */
export function menuLine(module: CatalogModule): string {
    if (!module.menu) return "Limit or feature, no menu row";
    return (
        `Dashboard: ${menuLabel(module.menu)}` +
        (module.child ? ` › ${module.child}` : "")
    );
}

/** The Module details note. */
export function menuNote(module: CatalogModule): string {
    if (!module.menu) {
        return "No menu row of its own. Its limits and access are checked where it's used.";
    }
    return (
        `In the dashboard this controls ${menuLabel(module.menu)}` +
        (module.child ? ` › ${module.child}` : "") +
        "."
    );
}

/**
 * "+ Add module": "New module", coming soon on the pricing page, no cells
 * (so excluded and locked everywhere), at the end of the first group.
 * Returns its id, or null when there is no group to put it in.
 */
export function addModule(catalog: Catalog, now?: number): string | null {
    const group = catalog.groups[0]?.id;
    if (!group) return null;
    const id = freshId(
        "m",
        catalog.modules.map((m) => m.id),
        now,
    );
    const mod: CatalogModule = {
        id,
        name: "New module",
        group,
        pricing: "soon",
        what: "",
        cells: {},
    };
    catalog.modules.splice(lastIndexInGroup(catalog, group) + 1, 0, mod);
    return id;
}

function lastIndexInGroup(catalog: Catalog, group: string): number {
    let last = -1;
    catalog.modules.forEach((m, i) => {
        if (m.group === group) last = i;
    });
    return last === -1 ? catalog.modules.length - 1 : last;
}

/** Where a module would move to within its group, or -1 at the edge. */
function neighbour(catalog: Catalog, moduleId: string, step: -1 | 1): number {
    const i = catalog.modules.findIndex((m) => m.id === moduleId);
    if (i < 0) return -1;
    const group = catalog.modules.at(i)?.group;
    for (let j = i + step; j >= 0 && j < catalog.modules.length; j += step) {
        if (catalog.modules.at(j)?.group === group) return j;
    }
    return -1;
}

export function canMove(
    catalog: Catalog,
    moduleId: string,
    step: -1 | 1,
): boolean {
    return neighbour(catalog, moduleId, step) >= 0;
}

/** Order ↑↓: swap with the next module of the same group. */
export function moveModule(
    catalog: Catalog,
    moduleId: string,
    step: -1 | 1,
): void {
    const i = catalog.modules.findIndex((m) => m.id === moduleId);
    const j = neighbour(catalog, moduleId, step);
    if (i < 0 || j < 0) return;
    const list = catalog.modules;
    [list[i], list[j]] = [list[j], list[i]] as [CatalogModule, CatalogModule];
}

/** "Row group on the pricing page": moves the module to the end of its new group. */
export function setModuleGroup(
    catalog: Catalog,
    moduleId: string,
    group: string,
): void {
    const i = catalog.modules.findIndex((m) => m.id === moduleId);
    if (i < 0) return;
    const [mod] = catalog.modules.splice(i, 1) as [CatalogModule];
    mod.group = group;
    catalog.modules.splice(lastIndexInGroup(catalog, group) + 1, 0, mod);
}

export interface ModuleGroup {
    id: string;
    name: string;
    modules: CatalogModule[];
}

/**
 * Modules by row group, in catalogue order. A module whose group is gone
 * (the draft doesn't validate yet) is still shown, last, so nothing is
 * hidden from the operator who has to fix it.
 */
export function groupModules(
    catalog: Catalog,
    match: (m: CatalogModule) => boolean = () => true,
): ModuleGroup[] {
    const out: ModuleGroup[] = catalog.groups.map((g) => ({
        id: g.id,
        name: g.name,
        modules: catalog.modules.filter((m) => m.group === g.id && match(m)),
    }));
    const known = new Set(catalog.groups.map((g) => g.id));
    const lost = catalog.modules.filter((m) => !known.has(m.group) && match(m));
    if (lost.length) out.push({ id: "", name: "No group", modules: lost });
    return out.filter((g) => g.modules.length > 0);
}
