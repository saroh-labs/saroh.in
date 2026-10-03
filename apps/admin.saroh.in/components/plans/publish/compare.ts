import type { Catalog, Cell, Plan } from "@saroh/pricing-catalog";
import { cellOf, formatInr, yearlyPaise } from "@saroh/pricing-catalog";

/**
 * "Live and draft, side by side" (plans catalogue U10), pure: for each plan
 * in the draft, only the rows that differ, as the design words them.
 */

export interface CompareLine {
    key: string;
    live: string;
    draft: string;
}

export interface ComparePlan {
    planId: string;
    name: string;
    lines: CompareLine[];
    /** "No changes", or "N other rows the same". */
    same: string;
}

/** A cell as the comparison says it: its limit, its words, or not included. */
export function cellWords(c: Cell): string {
    if (!c.inc) return "Not included";
    if (c.limit === null) return c.text || "Included";
    return `${c.limit.toLocaleString("en-IN")}${c.per ? " a month" : ""}`;
}

function yearlyWords(catalog: Catalog, plan: Plan): string {
    return catalog.yearly.on && plan.pricePaise
        ? formatInr(yearlyPaise(plan.pricePaise, catalog.yearly.paid))
        : "—";
}

function trialWords(plan: Plan): string {
    return plan.trial?.on ? `${plan.trial.days} days` : "—";
}

export function comparePlans(
    live: Catalog | null,
    draft: Catalog,
): ComparePlan[] {
    return draft.plans.map((p) => {
        const o = live?.plans.find((x) => x.id === p.id) ?? null;
        const lines: CompareLine[] = [];
        const line = (key: string, a: string, b: string) => {
            if (a !== b) lines.push({ key, live: a, draft: b });
        };
        line(
            "Price",
            o ? formatInr(o.pricePaise) : "—",
            formatInr(p.pricePaise),
        );
        if (o && live) {
            line("Yearly", yearlyWords(live, o), yearlyWords(draft, p));
            line("Trial", trialWords(o), trialWords(p));
            if (o.retired !== p.retired) {
                line(
                    "Status",
                    o.retired ? "Retired" : "Offered",
                    p.retired ? "Retired" : "Offered",
                );
            }
        }
        let same = 0;
        for (const m of draft.modules) {
            const lm = live?.modules.find((x) => x.id === m.id);
            const was = lm ? cellOf(lm, p.id) : null;
            const now = cellOf(m, p.id);
            if (was && JSON.stringify(was) === JSON.stringify(now)) {
                same += 1;
                continue;
            }
            line(m.name, was ? cellWords(was) : "—", cellWords(now));
        }
        return {
            planId: p.id,
            name: p.name,
            lines,
            same: lines.length
                ? `${same} other ${same === 1 ? "row" : "rows"} the same`
                : "No changes",
        };
    });
}
