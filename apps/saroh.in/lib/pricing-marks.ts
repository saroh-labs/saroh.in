import type {
    CompareRow,
    PlanCardView,
    PricingPageModel,
    PricingView,
    ViewKey,
} from "./pricing-model";

/**
 * "Show what changed" on the staff draft preview (admin redesign U13, R24):
 * the draft's pricing page with what differs from the live one marked. It
 * compares the two pages as they are drawn, not the catalogues, so a mark is
 * exactly a difference a visitor would see: a plan's name or price, a line
 * on its card, a cell of the comparison table (with what it was).
 *
 * The public page never calls this; its model carries no marks.
 */
export function markChanges(
    draft: PricingPageModel,
    live: PricingPageModel,
): PricingPageModel {
    const views = {} as Record<ViewKey, PricingView>;
    for (const key of Object.keys(draft.views) as ViewKey[]) {
        const view = draft.views[key];
        const before = live.views[key];
        views[key] = { ...view, plans: markPlans(view.plans, before.plans) };
    }
    // The table's columns follow the plan cards, the same in every view.
    const columns = draft.views["month-excl"].plans.map((p) => p.id);
    const liveColumns = live.views["month-excl"].plans.map((p) => p.id);
    return {
        ...draft,
        views,
        rows: markRows(draft.rows, live.rows, columns, liveColumns),
    };
}

function markPlans(
    plans: PlanCardView[],
    before: PlanCardView[],
): PlanCardView[] {
    return plans.map((p) => {
        const was = before.find((b) => b.id === p.id);
        if (!was) {
            return {
                ...p,
                changed: {
                    name: true,
                    price: true,
                    lines: p.lines.map((l) => l.t),
                },
            };
        }
        const had = new Set(was.lines.map((l) => l.t));
        const changed = {
            name: was.name !== p.name,
            price: was.price !== p.price || was.per !== p.per,
            lines: p.lines.map((l) => l.t).filter((t) => !had.has(t)),
        };
        const any = changed.name || changed.price || changed.lines.length > 0;
        return any ? { ...p, changed } : p;
    });
}

type Line = Extract<CompareRow, { kind: "line" }>;
type Cell = Line["cells"][number];

/** A cell as a visitor reads it. */
export function cellWords(cell: Cell | undefined): string {
    if (!cell) return "Not on the page";
    return cell.yes ? cell.t : "Not included";
}

function markRows(
    rows: CompareRow[],
    before: CompareRow[],
    columns: string[],
    liveColumns: string[],
): CompareRow[] {
    const liveLines = new Map<string, Line>();
    for (const r of before) if (r.kind === "line") liveLines.set(r.label, r);
    return rows.map((r) => {
        if (r.kind !== "line") return r;
        const was = liveLines.get(r.label);
        if (!was) return { ...r, added: true };
        const cells = r.cells.map((c, j) => {
            const at = liveColumns.indexOf(columns[j] ?? "");
            const then = cellWords(at >= 0 ? was.cells[at] : undefined);
            return then === cellWords(c) ? c : { ...c, was: then };
        });
        return cells.some((c, j) => c !== r.cells[j]) ? { ...r, cells } : r;
    });
}
