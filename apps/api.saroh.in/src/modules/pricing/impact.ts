import type { BillingCycle, Catalog, Cell } from "@saroh/pricing-catalog";
import {
    cellOf,
    formatCount,
    formatInr,
    monthlyEquivalentPaise,
    planPricePaise,
} from "@saroh/pricing-catalog";

/**
 * What a catalogue change does to the businesses on it (plans catalogue U3):
 * the admin's impact list (Takes away / Check / Gives more / Pricing page),
 * plan revenue a month now and next, and each module's usage line. Pure: the
 * caller reads the businesses (`impact.service.ts`) and this decides.
 *
 * The rules and the wording follow the design's prototype (`impact()` and the
 * plan editor's usage line in the admin Plans screen). Where the prototype
 * had numbers the API can't yet count — a module's usage before metering
 * (U13) — the item says so rather than claiming nobody uses it.
 */

/** One business as the catalogue sees it. */
export interface CatalogueBusiness {
    id: string;
    name: string;
    /** Its catalogue plan id, after a live `plan` override. */
    planId: string;
    /** The catalogue version its subscription is on; null for legacy or none. */
    version: number | null;
    /** Pays for its plan today (an active or past-due paid subscription). */
    paying: boolean;
    cycle: BillingCycle;
    /** What it pays a month today before GST, in paise (yearly as a month). */
    currentPaise: number;
    /** Has a live custom price (`price` override); a plan price change skips it. */
    ownPrice: boolean;
    /** How much it uses, by catalogue module id — only the modules counted. */
    usage: Readonly<Record<string, number>>;
}

export type ImpactTone = "danger" | "warn" | "ok" | "info";

/** The design's label for each tone. */
export const IMPACT_LABELS: Readonly<Record<ImpactTone, string>> = {
    danger: "Takes away",
    warn: "Check",
    ok: "Gives more",
    info: "Pricing page",
};

export interface ImpactItem {
    tone: ImpactTone;
    label: string;
    title: string;
    detail: string;
    /** The businesses it touches, for the list under the item. */
    businesses: { id: string; name: string }[];
}

export interface Impact {
    items: ImpactItem[];
    /** Businesses any item touches. */
    touched: number;
    total: number;
    /** Plan revenue a month, before GST, in paise. */
    revenue: { nowPaise: number; nextPaise: number };
}

export interface ImpactInput {
    live: Catalog;
    next: Catalog;
    businesses: readonly CatalogueBusiness[];
    /** The catalogue modules whose usage is counted. */
    measured: ReadonlySet<string>;
}

const same = (a: unknown, b: unknown) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A cell in the design's words: "Not included", "Included", "100 a month". */
export function limitWords(c: Cell): string {
    if (!c.inc) return "Not included";
    if (c.limit == null) return c.text || "Included";
    return formatCount(c.limit) + (c.per ? " a month" : "");
}

const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

/** The impact of publishing `next` over `live`. */
export function catalogueImpact(input: ImpactInput): Impact {
    const { live, next, businesses, measured } = input;
    const items: ImpactItem[] = [];
    const hit = new Set<string>();
    const on = (planId: string) =>
        businesses.filter((b) => b.planId === planId);
    const use = (b: CatalogueBusiness, moduleId: string) =>
        b.usage[moduleId] ?? 0;
    const add = (
        tone: ImpactTone,
        title: string,
        detail: string,
        list: readonly CatalogueBusiness[] = [],
    ) => {
        for (const b of list) hit.add(b.id);
        items.push({
            tone,
            label: IMPACT_LABELS[tone],
            title,
            detail,
            businesses: list.map((b) => ({ id: b.id, name: b.name })),
        });
    };

    for (const p of next.plans) {
        const o = live.plans.find((x) => x.id === p.id);
        const list = on(p.id);
        if (!o) {
            add(
                "info",
                `New plan: ${p.name} at ${formatInr(p.pricePaise)}`,
                "Shown on the pricing page once published.",
            );
            continue;
        }
        if (o.pricePaise !== p.pricePaise) {
            const own = list.filter((b) => b.ownPrice);
            const pay = list.filter((b) => b.paying && !b.ownPrice);
            const up = p.pricePaise > o.pricePaise;
            add(
                up ? "warn" : "ok",
                `${p.name}: ${formatInr(o.pricePaise)} → ${formatInr(p.pricePaise)} a month`,
                `${plural(pay.length, "business pays", "businesses pay")} ${up ? "more" : "less"}` +
                    (own.length
                        ? `. ${own.length} have their own price and don't change.`
                        : "."),
                pay,
            );
        }
        if (!o.retired && p.retired) {
            add(
                "info",
                `${p.name} retired`,
                `Leaves the pricing page. The ${plural(list.length, "business", "businesses")} on it stay on it.`,
            );
        }
        if (!o.trial?.on && p.trial?.on) {
            add(
                "info",
                `${p.name}: ${p.trial.days}-day free trial`,
                "Payment method first; charged when it ends; drops to Free if the charge fails.",
            );
        }
    }

    const shownPlans = next.plans.filter((p) => !p.retired);
    for (const m of next.modules) {
        const o = live.modules.find((x) => x.id === m.id);
        if (!o) {
            add(
                "info",
                `New module: ${m.name}`,
                m.pricing === "soon"
                    ? "Shows as coming soon."
                    : "Added to the comparison table.",
            );
            continue;
        }
        const counted = measured.has(m.id);
        for (const p of shownPlans) {
            const x = cellOf(o, p.id);
            const y = cellOf(m, p.id);
            const list = on(p.id);
            if (!list.length && same(x, y)) continue;
            if (x.inc && !y.inc) {
                const seeIt =
                    y.off === "hidden"
                        ? "disappear from the menu."
                        : "locked, with an upgrade panel.";
                if (!counted) {
                    add(
                        "danger",
                        `${m.name} taken off ${p.name}`,
                        `${list.length} on ${p.name} lose it. They'd see it ${seeIt}`,
                        list,
                    );
                    continue;
                }
                const users = list.filter((b) => use(b, m.id) > 0);
                add(
                    "danger",
                    `${m.name} taken off ${p.name}`,
                    users.length
                        ? `${users.length} of ${list.length} on ${p.name} use it today. They'd see it ${seeIt}`
                        : `${list.length} on ${p.name} lose it. None use it today.`,
                    users,
                );
            } else if (!x.inc && y.inc) {
                add(
                    "ok",
                    `${m.name} added to ${p.name}`,
                    `${plural(list.length, "business", "businesses")} on ${p.name} get it.`,
                    list,
                );
            } else if (
                x.inc &&
                y.inc &&
                (x.limit !== y.limit || x.per !== y.per)
            ) {
                const title = `${m.name} on ${p.name}: ${limitWords(x)} → ${limitWords(y)}`;
                const nl = y.limit;
                const ol = x.limit;
                if (nl != null && (ol == null || nl < ol || x.per !== y.per)) {
                    if (!counted) {
                        add(
                            "warn",
                            title,
                            "Usage isn't counted for this yet, so who would be over it can't be shown.",
                            list,
                        );
                        continue;
                    }
                    const over = list.filter((b) => use(b, m.id) > nl);
                    const near = list.filter(
                        (b) => use(b, m.id) >= 0.8 * nl && use(b, m.id) <= nl,
                    );
                    add(
                        over.length ? "danger" : "warn",
                        title,
                        (over.length
                            ? `${over.length} over the new limit. What's over stays, read-only.`
                            : "Nobody is over it.") +
                            (near.length
                                ? ` ${near.length} at 80% or more will see a warning.`
                                : ""),
                        [...over, ...near],
                    );
                } else {
                    add(
                        "ok",
                        title,
                        `${plural(list.length, "business gets", "businesses get")} more room.`,
                        list,
                    );
                }
            } else if (!x.inc && !y.inc && x.off !== y.off) {
                add(
                    "info",
                    `${m.name} on ${p.name}: ${y.off === "hidden" ? "hidden" : "shown locked"}`,
                    `Changes the dashboard menu for ${plural(list.length, "business", "businesses")}.`,
                );
            }
        }
    }

    for (const m of live.modules) {
        if (next.modules.some((x) => x.id === m.id)) continue;
        if (measured.has(m.id)) {
            const users = businesses.filter((b) => use(b, m.id) > 0);
            add(
                "danger",
                `Module removed: ${m.name}`,
                `${plural(users.length, "business uses", "businesses use")} it today.`,
                users,
            );
        } else {
            const have = businesses.filter((b) => cellOf(m, b.planId).inc);
            add(
                "danger",
                `Module removed: ${m.name}`,
                `${plural(have.length, "business has", "businesses have")} it on their plan today.`,
                have,
            );
        }
    }

    for (const a of next.addons) {
        if (live.addons.some((x) => x.id === a.id)) continue;
        const moduleId = a.kind === "module" ? (a.module ?? "") : a.kind;
        const mod = next.modules.find((x) => x.id === moduleId);
        if (a.kind !== "module" && !measured.has(moduleId)) {
            add(
                "info",
                `New add-on: ${a.name}`,
                "Usage isn't counted for this yet, so who could use it can't be shown.",
            );
            continue;
        }
        const pros = businesses.filter((b) => {
            if (!mod) return false;
            const c = cellOf(mod, b.planId);
            if (a.kind === "module") return !c.inc;
            return (
                c.inc && c.limit != null && use(b, moduleId) >= 0.8 * c.limit
            );
        });
        add(
            "info",
            `New add-on: ${a.name}`,
            pros.length
                ? a.kind === "module"
                    ? `${plural(pros.length, "business doesn't", "businesses don't")} have it on their plan and could buy it.`
                    : `${plural(pros.length, "business is", "businesses are")} at 80% or more of their limit and could buy it.`
                : "Nobody needs it yet.",
            pros,
        );
    }

    if (!live.yearly.on && next.yearly.on) {
        add(
            "info",
            `Yearly billing: pay for ${next.yearly.paid} months, get 12`,
            "A monthly or yearly switch appears on the pricing page.",
        );
    }
    if (live.gst.show !== next.gst.show) {
        add(
            "info",
            `Prices shown ${next.gst.show === "incl" ? "with" : "without"} GST first`,
            "Visitors can still switch.",
        );
    }

    let nowPaise = 0;
    let nextPaise = 0;
    for (const b of businesses) {
        nowPaise += b.currentPaise;
        nextPaise += nextPriceOf(b, next);
    }

    return {
        items,
        touched: hit.size,
        total: businesses.length,
        revenue: { nowPaise, nextPaise },
    };
}

/**
 * What a business would pay a month on `next`: unchanged with its own price
 * or when it isn't paying (Free, a trial, a plan override with no charge);
 * otherwise its plan's price on `next` for its cycle.
 */
function nextPriceOf(b: CatalogueBusiness, next: Catalog): number {
    if (b.ownPrice || !b.paying) return b.currentPaise;
    const plan = next.plans.find((p) => p.id === b.planId);
    if (!plan) return b.currentPaise;
    const price = planPricePaise(next, plan, b.cycle);
    return b.cycle === "year" ? monthlyEquivalentPaise(price) : price;
}

/** A module's usage on one plan: the plan editor's line under each row. */
export interface ModuleUsage {
    moduleId: string;
    /** Businesses on the plan. */
    businesses: number;
    /** Whether this module's usage is counted; when not, the rest is null. */
    measured: boolean;
    using: number | null;
    highest: number | null;
    /** Over the cell's limit, and at 80% or more of it (not over). */
    over: number | null;
    near: number | null;
    /**
     * Each business's count, highest first, unnamed — so the editor can
     * recount over and near as the limit is typed. Null when not counted.
     */
    values: number[] | null;
    /** The design's line, or null when there is nothing true to say. */
    line: string | null;
}

export function moduleUsage(
    catalog: Catalog,
    planId: string,
    moduleId: string,
    businesses: readonly CatalogueBusiness[],
    measured: ReadonlySet<string>,
): ModuleUsage {
    const plan = catalog.plans.find((p) => p.id === planId);
    const mod = catalog.modules.find((m) => m.id === moduleId);
    const planName = plan?.name ?? planId;
    const list = businesses.filter((b) => b.planId === planId);
    const base = {
        moduleId,
        businesses: list.length,
    };
    if (!measured.has(moduleId) || !mod) {
        return {
            ...base,
            measured: false,
            using: null,
            highest: null,
            over: null,
            near: null,
            values: null,
            line: list.length ? null : `Nobody on ${planName} yet`,
        };
    }
    const values = list
        .map((b) => b.usage[moduleId] ?? 0)
        .sort((a, b) => b - a);
    const c = cellOf(mod, planId);
    const limit = c.inc ? c.limit : null;
    const using = values.filter((u) => u > 0).length;
    const highest = values.length ? values[0] : 0;
    const over = limit != null ? values.filter((u) => u > limit).length : 0;
    const near =
        limit != null
            ? values.filter((u) => u >= 0.8 * limit && u <= limit).length
            : 0;
    let line: string;
    if (!list.length) line = `Nobody on ${planName} yet`;
    else if (!using) line = `Nobody on ${planName} uses it`;
    else {
        line = `${using} of ${list.length} use it`;
        if (limit != null || highest > 1) {
            line += ` · highest ${formatCount(highest)}`;
        }
        if (over) line += ` · ${over} over the limit`;
        else if (near) line += ` · ${near} at 80%+`;
    }
    return {
        ...base,
        measured: true,
        using,
        highest,
        over,
        near,
        values,
        line,
    };
}
