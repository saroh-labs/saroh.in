import type { Catalog } from "./schema";
import { cellOf } from "./schema";

export interface CardLine {
    t: string;
    soon: boolean;
}

export interface CardLines {
    /** "Everything in ‹previous plan›, plus:", or empty for the first plan. */
    lead: string;
    lines: CardLine[];
}

/** The plans a visitor can choose, in catalogue order. */
export function offeredPlans(catalog: Catalog) {
    return catalog.plans.filter((p) => !p.retired);
}

/**
 * A plan card's bullets: the first plan lists what it has; each later plan
 * lists only what differs from the plan before it. Modules hidden from the
 * pricing page are left out; "soon" ones are marked.
 */
export function cardLines(catalog: Catalog, planId: string): CardLines {
    const plans = offeredPlans(catalog);
    const i = plans.findIndex((p) => p.id === planId);
    const prev = i > 0 ? plans[i - 1] : undefined;
    const lines: CardLine[] = [];
    for (const m of catalog.modules) {
        if (m.pricing === "hidden") continue;
        const c = cellOf(m, planId);
        if (!c.inc || !c.card) continue;
        if (prev) {
            const pc = cellOf(m, prev.id);
            if (pc.inc && pc.text === c.text && pc.card === c.card) continue;
        }
        const soon = m.pricing === "soon";
        lines.push({ t: c.card + (soon ? " (coming soon)" : ""), soon });
    }
    return {
        lead: prev ? `Everything in ${prev.name}, plus:` : "",
        lines,
    };
}
