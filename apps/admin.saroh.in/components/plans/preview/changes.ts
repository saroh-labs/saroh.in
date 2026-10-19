import type {
    Addon,
    Catalog,
    CatalogModule,
    Cell,
    Plan,
} from "@saroh/pricing-catalog";
import {
    addonPlanNames,
    autopayCharges,
    cellOf,
    formatCount,
    formatInr,
} from "@saroh/pricing-catalog";

import type { PlansTab } from "@/lib/pricing-draft";
import type { AdminPlanCount, Impact } from "@/lib/pricing-types";

import type { PlansFocus } from "../plans-nav";
import { removeModule, removePlan } from "../plans/structure-edits";

/**
 * "Changes in this draft" (admin redesign U13, R18, R24): what the draft
 * changes from live, one entry per line of the change log, each with the
 * plan it belongs to, who it reaches, where to edit it, and its own Undo.
 *
 * The lines and their words are `diff()`'s from `@saroh/pricing-catalog`
 * (the log a version keeps and the API's save returns), worked out the same
 * way and in the same order, so the draft bar's count, this list and the
 * publish dialog never disagree (`preview.test.tsx` holds it to that). What
 * `diff` can't give is the structure: which plan, and how to take one line
 * back without touching the rest. Each `undo` puts back live's value for
 * that one thing, on a draft passed to `useDraft().edit`.
 */

export interface DraftChange {
    /** Stable while the change stands: its kind and what it is on. */
    key: string;
    /** The plan it is on, by name; null when it is not one plan's. */
    plan: string | null;
    /**
     * Whose businesses it reaches at renewal: plan ids, "all" for every
     * plan, or "page" when only the pricing page changes.
     */
    reaches: string[] | "all" | "page";
    /** The change log's own words. */
    what: string;
    /** Where it is edited. */
    edit: { tab: PlansTab; focus?: PlansFocus };
    /** Live's value back for this one change; null when it can't be. */
    undo: ((draft: Catalog) => void) | null;
}

const PRICING_WORDS = {
    show: "shown",
    soon: "coming soon",
    hidden: "hidden",
} as const;

const clone = <T>(x: T): T => structuredClone(x);

function planById(c: Catalog, id: string): Plan | undefined {
    return c.plans.find((p) => p.id === id);
}

function moduleById(c: Catalog, id: string): CatalogModule | undefined {
    return c.modules.find((m) => m.id === id);
}

/** Put live's cell back (or none, where live had none). */
function putCell(
    draft: Catalog,
    moduleId: string,
    planId: string,
    was: Cell | undefined,
) {
    const m = moduleById(draft, moduleId);
    if (!m) return;
    if (was) m.cells[planId] = clone(was);
    else delete m.cells[planId];
}

/** Order `items` so the ones live has follow live's order; new ones stay put. */
function liveOrder<T extends { id: string }>(
    items: T[],
    live: readonly { id: string }[],
): T[] {
    const kept = items.filter((x) => live.some((l) => l.id === x.id));
    kept.sort(
        (a, b) =>
            live.findIndex((l) => l.id === a.id) -
            live.findIndex((l) => l.id === b.id),
    );
    let next = 0;
    return items.map((x) =>
        live.some((l) => l.id === x.id) ? kept[next++] : x,
    );
}

function planChanges(live: Catalog, draft: Catalog): DraftChange[] {
    const out: DraftChange[] = [];
    for (const p of draft.plans) {
        const o = planById(live, p.id);
        const at = { tab: "plans" as const, focus: { planId: p.id } };
        if (!o) {
            out.push({
                key: `plan-new:${p.id}`,
                plan: p.name,
                reaches: "page",
                what: `New plan: ${p.name} at ${formatInr(p.pricePaise)}`,
                edit: at,
                undo: (d) => {
                    removePlan(d, live, p.id);
                },
            });
            continue;
        }
        const set = (fn: (now: Plan, was: Plan) => void) => (d: Catalog) => {
            const now = planById(d, p.id);
            if (now) fn(now, o);
        };
        if (o.name !== p.name) {
            out.push({
                key: `plan-name:${p.id}`,
                plan: p.name,
                reaches: "page",
                what: `${o.name} renamed to ${p.name}`,
                edit: at,
                undo: set((now, was) => {
                    now.name = was.name;
                }),
            });
        }
        if (o.pricePaise !== p.pricePaise) {
            out.push({
                key: `plan-price:${p.id}`,
                plan: p.name,
                reaches: [p.id],
                what: `${p.name}: ${formatInr(o.pricePaise)} → ${formatInr(p.pricePaise)} a month`,
                edit: at,
                undo: set((now, was) => {
                    now.pricePaise = was.pricePaise;
                }),
            });
        }
        if (o.retired !== p.retired) {
            out.push({
                key: `plan-retired:${p.id}`,
                plan: p.name,
                reaches: "page",
                what: p.retired
                    ? `${p.name} retired: no new businesses can choose it`
                    : `${p.name} offered again`,
                edit: at,
                undo: set((now, was) => {
                    now.retired = was.retired;
                }),
            });
        }
        if (
            o.tagline !== p.tagline ||
            o.cta !== p.cta ||
            o.featured !== p.featured
        ) {
            out.push({
                key: `plan-card:${p.id}`,
                plan: p.name,
                reaches: "page",
                what: `${p.name}: card wording or highlight changed`,
                edit: at,
                undo: (d) => {
                    const now = planById(d, p.id);
                    if (!now) return;
                    now.tagline = o.tagline;
                    now.cta = o.cta;
                    // One plan is highlighted at most: taking the highlight
                    // back takes it off whichever plan has it now.
                    if (o.featured && !now.featured) {
                        for (const x of d.plans) x.featured = false;
                    }
                    now.featured = o.featured;
                },
            });
        }
    }
    const liveIds = live.plans.map((p) => p.id).join();
    const kept = draft.plans
        .map((p) => p.id)
        .filter((id) => live.plans.some((x) => x.id === id))
        .join();
    if (liveIds !== kept) {
        out.push({
            key: "plans-order",
            plan: null,
            reaches: "page",
            what: "Plans reordered",
            edit: { tab: "plans" },
            undo: (d) => {
                d.plans = liveOrder(d.plans, live.plans);
            },
        });
    }
    return out;
}

function cellLine(
    m: CatalogModule,
    planName: string,
    x: Cell,
    y: Cell,
): string | null {
    if (x.inc !== y.inc) {
        return `${m.name}${y.inc ? " added to " : " removed from "}${planName}`;
    }
    if (
        x.inc &&
        y.inc &&
        (x.text !== y.text || x.limit !== y.limit || x.per !== y.per)
    ) {
        return `${m.name} on ${planName}: ${x.text || "—"} → ${y.text || "—"}`;
    }
    if (x.inc && y.inc && x.soft !== y.soft) {
        return `${m.name} on ${planName}: ${y.soft ? "a soft cap, never refused" : "a hard cap"}`;
    }
    if (!x.inc && !y.inc && x.off !== y.off) {
        return `${m.name} on ${planName}: ${y.off === "hidden" ? "hidden" : "shown locked"} in the dashboard`;
    }
    return null;
}

function moduleChanges(live: Catalog, draft: Catalog): DraftChange[] {
    const out: DraftChange[] = [];
    for (const m of draft.modules) {
        const o = moduleById(live, m.id);
        const at = { tab: "plans" as const, focus: { moduleId: m.id } };
        if (!o) {
            const where =
                m.pricing === "soon"
                    ? " (coming soon)"
                    : m.pricing === "hidden"
                      ? " (not on the pricing page)"
                      : "";
            out.push({
                key: `module-new:${m.id}`,
                plan: null,
                reaches: "all",
                what: `New module: ${m.name}${where}`,
                edit: at,
                undo: (d) => {
                    removeModule(d, live, m.id);
                },
            });
            continue;
        }
        const set =
            (fn: (now: CatalogModule, was: CatalogModule) => void) =>
            (d: Catalog) => {
                const now = moduleById(d, m.id);
                if (now) fn(now, o);
            };
        if (o.name !== m.name) {
            out.push({
                key: `module-name:${m.id}`,
                plan: null,
                reaches: "page",
                what: `${o.name} renamed to ${m.name}`,
                edit: at,
                undo: set((now, was) => {
                    now.name = was.name;
                }),
            });
        }
        if (o.pricing !== m.pricing) {
            out.push({
                key: `module-pricing:${m.id}`,
                plan: null,
                reaches: "page",
                what: `${m.name}: pricing page ${PRICING_WORDS[m.pricing]}`,
                edit: { tab: "modules" },
                undo: set((now, was) => {
                    now.pricing = was.pricing;
                }),
            });
        }
        if (o.group !== m.group) {
            const g =
                draft.groups.find((x) => x.id === m.group)?.name ?? m.group;
            out.push({
                key: `module-group:${m.id}`,
                plan: null,
                reaches: "page",
                what: `${m.name} moved to ${g}`,
                edit: { tab: "modules" },
                undo: (d) => {
                    const now = moduleById(d, m.id);
                    if (!now) return;
                    // Its old group may have been removed since: back too.
                    if (!d.groups.some((x) => x.id === o.group)) {
                        const lg = live.groups.find((x) => x.id === o.group);
                        if (lg) d.groups.push(clone(lg));
                    }
                    now.group = o.group;
                },
            });
        }
        for (const p of draft.plans) {
            const x = cellOf(o, p.id);
            const y = cellOf(m, p.id);
            const what = cellLine(m, p.name, x, y);
            if (!what) continue;
            const was = o.cells[p.id];
            out.push({
                key: `cell:${m.id}:${p.id}`,
                plan: p.name,
                reaches: planById(live, p.id) ? [p.id] : "page",
                what,
                edit: {
                    tab: "plans",
                    focus: { moduleId: m.id, planId: p.id },
                },
                undo: (d) => putCell(d, m.id, p.id, was),
            });
        }
    }
    for (const m of live.modules) {
        if (draft.modules.some((x) => x.id === m.id)) continue;
        out.push({
            key: `module-gone:${m.id}`,
            plan: null,
            reaches: "all",
            what: `Module removed: ${m.name}`,
            edit: { tab: "modules" },
            undo: (d) => {
                if (moduleById(d, m.id)) return;
                const at = live.modules.findIndex((x) => x.id === m.id);
                d.modules.splice(Math.min(at, d.modules.length), 0, clone(m));
            },
        });
    }
    const order = (c: Catalog) =>
        c.modules
            .map((m) => m.id)
            .filter(
                (id) =>
                    live.modules.some((x) => x.id === id) &&
                    draft.modules.some((x) => x.id === id),
            )
            .join();
    if (order(live) !== order(draft)) {
        out.push({
            key: "modules-order",
            plan: null,
            reaches: "page",
            what: "Rows reordered on the pricing page",
            edit: { tab: "modules" },
            undo: (d) => {
                d.modules = liveOrder(d.modules, live.modules);
            },
        });
    }
    return out;
}

function offerChanges(live: Catalog, draft: Catalog): DraftChange[] {
    const out: DraftChange[] = [];
    const offers = { tab: "offers" as const };
    const ya = live.yearly;
    const yb = draft.yearly;
    const yearly = (what: string): DraftChange => ({
        key: "yearly",
        plan: null,
        reaches: "all",
        what,
        edit: offers,
        undo: (d) => {
            d.yearly = clone(live.yearly);
        },
    });
    if (ya.on !== yb.on) {
        out.push(
            yearly(
                yb.on
                    ? `Yearly billing on: pay for ${yb.paid} months, get 12`
                    : "Yearly billing off",
            ),
        );
    } else if (yb.on && ya.paid !== yb.paid) {
        out.push(
            yearly(`Yearly billing: pay for ${ya.paid} → ${yb.paid} months`),
        );
    }
    const ca = autopayCharges(live);
    const cb = autopayCharges(draft);
    if (ca !== cb) {
        out.push({
            key: "autopay",
            plan: null,
            reaches: "all",
            what: `One autopay covers ${ca} → ${cb} monthly charges`,
            edit: offers,
            undo: (d) => {
                d.autopay = clone(live.autopay);
            },
        });
    }
    if (live.gst.show !== draft.gst.show) {
        out.push({
            key: "gst",
            plan: null,
            reaches: "page",
            what: `Pricing page shows prices ${draft.gst.show === "incl" ? "with" : "without"} GST first`,
            edit: offers,
            undo: (d) => {
                d.gst = clone(live.gst);
            },
        });
    }
    for (const p of draft.plans) {
        const o = planById(live, p.id);
        if (!o) continue;
        const ta = o.trial ?? { on: false, days: 0 };
        const tb = p.trial ?? { on: false, days: 0 };
        const trial = (fn: (now: Plan) => void) => (d: Catalog) => {
            const now = planById(d, p.id);
            if (now) fn(now);
        };
        if (ta.on !== tb.on || (tb.on && ta.days !== tb.days)) {
            out.push({
                key: `trial:${p.id}`,
                plan: p.name,
                reaches: [p.id],
                what:
                    ta.on !== tb.on
                        ? `${p.name}: ${tb.on ? `${tb.days}-day free trial on` : "free trial off"}`
                        : `${p.name} trial: ${ta.days} → ${tb.days} days`,
                edit: offers,
                undo: trial((now) => {
                    if (!o.trial) {
                        // Live had none: off, keeping what was typed.
                        if (now.trial) now.trial.on = false;
                        return;
                    }
                    now.trial = {
                        ...(now.trial ?? o.trial),
                        on: o.trial.on,
                        days: o.trial.days,
                    };
                }),
            });
        }
        const fa = ta.on ? (ta.firstPaise ?? 0) : 0;
        const fb = tb.on ? (tb.firstPaise ?? 0) : 0;
        if (tb.on && fa !== fb) {
            out.push({
                key: `trial-first:${p.id}`,
                plan: p.name,
                reaches: [p.id],
                what:
                    fb > 0
                        ? `${p.name}: first ${tb.days} days cost ${formatInr(fb)} + GST`
                        : `${p.name}: first ${tb.days} days free`,
                edit: offers,
                undo: trial((now) => {
                    if (!now.trial) return;
                    if (fa > 0) now.trial.firstPaise = fa;
                    else delete now.trial.firstPaise;
                }),
            });
        }
    }
    for (const x of draft.addons) {
        const o = live.addons.find((y) => y.id === x.id);
        const on = addonPlanNames(draft, x);
        const scope = x.plans?.length ? x.plans : ("all" as const);
        if (!o) {
            out.push({
                key: `addon-new:${x.id}`,
                plan: null,
                reaches: scope,
                what: `New add-on: ${x.name}${on ? ` on ${on}` : ""}`,
                edit: offers,
                undo: (d) => {
                    d.addons = d.addons.filter((a) => a.id !== x.id);
                },
            });
            continue;
        }
        const set = (fn: (now: Addon) => void) => (d: Catalog) => {
            const now = d.addons.find((a) => a.id === x.id);
            if (now) fn(now);
        };
        const { plans: wasPlans, max: wasMax, ...was } = o;
        const { plans: nowPlans, max: nowMax, ...now } = x;
        if (JSON.stringify(was) !== JSON.stringify(now)) {
            out.push({
                key: `addon:${x.id}`,
                plan: null,
                reaches: scope,
                what: `Add-on changed: ${x.name}`,
                edit: offers,
                undo: set((a) => {
                    const back = clone(was);
                    for (const k of Object.keys(a) as (keyof Addon)[]) {
                        if (k !== "plans" && k !== "max" && !(k in back)) {
                            delete a[k];
                        }
                    }
                    Object.assign(a, back);
                }),
            });
        }
        const planKey = (ids?: string[]) => [...(ids ?? [])].sort().join();
        if (planKey(wasPlans) !== planKey(nowPlans)) {
            out.push({
                key: `addon-plans:${x.id}`,
                plan: null,
                reaches: scope,
                what: `${x.name}: offered on ${on || "every plan"}`,
                edit: offers,
                undo: set((a) => {
                    if (wasPlans) a.plans = [...wasPlans];
                    else delete a.plans;
                }),
            });
        }
        if (wasMax !== nowMax) {
            out.push({
                key: `addon-max:${x.id}`,
                plan: null,
                reaches: scope,
                what:
                    nowMax === undefined
                        ? `${x.name}: no maximum of its own`
                        : `${x.name}: a business can hold up to ${nowMax}`,
                edit: offers,
                undo: set((a) => {
                    if (wasMax === undefined) delete a.max;
                    else a.max = wasMax;
                }),
            });
        }
    }
    for (const x of live.addons) {
        if (draft.addons.some((y) => y.id === x.id)) continue;
        out.push({
            key: `addon-gone:${x.id}`,
            plan: null,
            reaches: x.plans?.length ? x.plans : "all",
            what: `Add-on removed: ${x.name}`,
            edit: offers,
            undo: (d) => {
                if (d.addons.some((a) => a.id === x.id)) return;
                const at = live.addons.findIndex((a) => a.id === x.id);
                d.addons.splice(Math.min(at, d.addons.length), 0, clone(x));
            },
        });
    }
    return out;
}

/**
 * Every change the draft makes to live, in `diff`'s order. Empty with
 * nothing live: a first version has nothing to differ from.
 */
export function draftChanges(
    live: Catalog | null,
    draft: Catalog | null,
): DraftChange[] {
    if (!live || !draft) return [];
    return [
        ...planChanges(live, draft),
        ...moduleChanges(live, draft),
        ...offerChanges(live, draft),
    ];
}

// ── Who it reaches ────────────────────────────────────────────────────────

function businessesOn(counts: readonly AdminPlanCount[], planId: string) {
    return counts.find((c) => c.planId === planId)?.businesses ?? 0;
}

const businessWord = (n: number) =>
    `${formatCount(n)} ${n === 1 ? "business" : "businesses"}`;

/**
 * Who one change reaches, in a line: the API's own words where its impact
 * names the same change, else the businesses on its plan at renewal.
 */
export function reachOf(
    change: DraftChange,
    counts: readonly AdminPlanCount[],
    impact: Impact | null,
): string {
    const said = impact?.items.find((i) => i.title === change.what);
    if (said?.detail) return said.detail;
    if (change.reaches === "page") return "Only the pricing page changes";
    if (change.reaches === "all") {
        const n = counts.reduce((sum, c) => sum + c.businesses, 0);
        return n === 0
            ? "Every plan. No business is on one yet"
            : `Every plan · ${businessWord(n)} at renewal`;
    }
    const n = change.reaches.reduce((s, id) => s + businessesOn(counts, id), 0);
    return n === 0
        ? "No business is on this plan yet"
        : `${businessWord(n)} at renewal`;
}

/**
 * The draft bar's second sentence: who would move at renewal, by plan.
 * "Would", because publishing can also keep everyone on their terms.
 */
export function moversLine(
    changes: readonly DraftChange[],
    plans: readonly Plan[],
    counts: readonly AdminPlanCount[],
): string {
    if (changes.length === 0)
        return "Nothing differs from the live version yet.";
    const ids = new Set<string>();
    let every = false;
    for (const c of changes) {
        if (c.reaches === "all") every = true;
        else if (c.reaches !== "page") c.reaches.forEach((id) => ids.add(id));
    }
    if (!every && ids.size === 0) return "Only the pricing page changes.";
    const on = plans.filter(
        (p) => (every || ids.has(p.id)) && businessesOn(counts, p.id) > 0,
    );
    const n = on.reduce((s, p) => s + businessesOn(counts, p.id), 0);
    if (n === 0) return "No business is on a plan it changes.";
    if (every && on.length > 1) {
        return `${businessWord(n)} on every plan would move at their renewal.`;
    }
    const names = on.map((p) => p.name);
    const list =
        names.length <= 1
            ? (names[0] ?? "")
            : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    return `${businessWord(n)} on ${list} would move at their renewal.`;
}
