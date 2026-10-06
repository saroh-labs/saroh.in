import { z } from "zod";

/**
 * The pricing catalogue: one snapshot of plans, the module-by-plan matrix and
 * the offers (yearly, GST display, trials, add-ons). A published snapshot is a
 * `PricingCatalogVersion` row and never changes; the shared draft has the same
 * shape. Coupons are not part of a snapshot (they apply at once, outside
 * versions).
 *
 * Every amount is integer paise (KTD-18). The design prototype held rupees;
 * the snapshot never does.
 */

/** Ids end up in billing keys (`catalog.<planId>`) and URLs (`?plan=`). */
const ID = /^[a-z][a-z0-9-]{0,39}$/;
const id = z.string().regex(ID, "Use lower-case letters, digits and dashes");
const paise = z.number().int().nonnegative();

export const LIMIT_PERIODS = ["", "month"] as const;
export type LimitPeriod = (typeof LIMIT_PERIODS)[number];

export const OFF_STATES = ["locked", "hidden"] as const;
export type OffState = (typeof OFF_STATES)[number];

export const PRICING_DISPLAY = ["show", "soon", "hidden"] as const;
export type PricingDisplay = (typeof PRICING_DISPLAY)[number];

export const GST_SHOW = ["excl", "incl"] as const;
export type GstShow = (typeof GST_SHOW)[number];

export const ADDON_KINDS = [
    "module",
    "members",
    "products",
    "orders",
    "bookings",
    "integrations",
] as const;
export type AddonKind = (typeof ADDON_KINDS)[number];

export const ADDON_MODES = ["pack", "unit"] as const;
export type AddonMode = (typeof ADDON_MODES)[number];

/** Trial length a catalogue may offer. A longer launch offer is a plan override (OQ-1). */
export const TRIAL_DAYS_MIN = 1;
export const TRIAL_DAYS_MAX = 60;
/** "Pay for N months, get 12". */
export const YEARLY_PAID_MIN = 1;
export const YEARLY_PAID_MAX = 12;

export const includedCellSchema = z.object({
    inc: z.literal(true),
    /** The comparison table's words. */
    text: z.string(),
    /** The plan card's line; empty means the card leaves it out. */
    card: z.string().default(""),
    /** A cap, or null for no cap. */
    limit: z.number().int().positive().nullable().default(null),
    per: z.enum(LIMIT_PERIODS).default(""),
    /**
     * A soft cap counts and tells the business when it's reached, and never
     * refuses: storage and site visits, where turning a customer away is worse
     * than a conversation about the bill.
     */
    soft: z.boolean().default(false),
});

export const excludedCellSchema = z.object({
    inc: z.literal(false),
    /** Locked shows in the dashboard with an upgrade panel; hidden doesn't show. */
    off: z.enum(OFF_STATES).default("locked"),
});

export const cellSchema = z.discriminatedUnion("inc", [
    includedCellSchema,
    excludedCellSchema,
]);

export const trialSchema = z.object({
    on: z.boolean(),
    days: z.number().int().min(TRIAL_DAYS_MIN).max(TRIAL_DAYS_MAX),
});

export const planSchema = z.object({
    id,
    name: z.string().min(1),
    /** Monthly price before GST. */
    pricePaise: paise,
    tagline: z.string().default(""),
    cta: z.string().default(""),
    featured: z.boolean().default(false),
    /** Retired plans keep their businesses; no new business can choose them. */
    retired: z.boolean().default(false),
    trial: trialSchema.optional(),
});

export const groupSchema = z.object({ id, name: z.string().min(1) });

export const moduleSchema = z.object({
    id,
    name: z.string().min(1),
    group: id,
    pricing: z.enum(PRICING_DISPLAY).default("show"),
    /** The dashboard rail entry it locks, and the child row under it. */
    menu: z.string().optional(),
    child: z.string().optional(),
    what: z.string().default(""),
    /** One cell per plan id; a missing cell reads as excluded and locked. */
    cells: z.record(cellSchema),
});

export const yearlySchema = z.object({
    on: z.boolean(),
    paid: z.number().int().min(YEARLY_PAID_MIN).max(YEARLY_PAID_MAX),
});

export const gstSchema = z.object({ show: z.enum(GST_SHOW) });

export const addonSchema = z.object({
    id,
    kind: z.enum(ADDON_KINDS),
    /** The module a `module` add-on switches on; absent for every other kind. */
    module: id.optional(),
    name: z.string().min(1),
    /** Monthly price before GST, per pack or per unit. */
    pricePaise: paise,
    mode: z.enum(ADDON_MODES),
    /** How much one pack adds (packs only; a unit adds one). */
    qty: z.number().int().positive(),
});

const catalogShape = z.object({
    plans: z.array(planSchema).min(1),
    groups: z.array(groupSchema),
    modules: z.array(moduleSchema),
    yearly: yearlySchema,
    gst: gstSchema,
    addons: z.array(addonSchema).default([]),
});

function duplicates(ids: readonly string[]): string[] {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const x of ids) (seen.has(x) ? dup : seen).add(x);
    return Array.from(dup);
}

/** A catalogue snapshot, with the rules that span its parts. */
export const catalogSchema = catalogShape.superRefine((c, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

    for (const [list, label] of [
        [c.plans.map((p) => p.id), "plans"],
        [c.groups.map((g) => g.id), "groups"],
        [c.modules.map((m) => m.id), "modules"],
        [c.addons.map((a) => a.id), "addons"],
    ] as const) {
        for (const d of duplicates(list))
            issue(`Two ${label} share the id "${d}"`, [label]);
    }

    const featured = c.plans.filter((p) => p.featured);
    if (featured.length > 1) {
        issue("Only one plan can be highlighted", ["plans"]);
    }

    c.plans.forEach((p, i) => {
        if (p.trial?.on && p.pricePaise === 0) {
            issue(`${p.name} is free, so it can't have a free trial`, [
                "plans",
                i,
                "trial",
            ]);
        }
    });

    const planIds = new Set(c.plans.map((p) => p.id));
    const groupIds = new Set(c.groups.map((g) => g.id));
    const moduleIds = new Set(c.modules.map((m) => m.id));

    c.modules.forEach((m, i) => {
        if (!groupIds.has(m.group)) {
            issue(`${m.name} is in a group that doesn't exist: ${m.group}`, [
                "modules",
                i,
                "group",
            ]);
        }
        for (const planId of Object.keys(m.cells)) {
            if (!planIds.has(planId)) {
                issue(`${m.name} has a cell for an unknown plan: ${planId}`, [
                    "modules",
                    i,
                    "cells",
                    planId,
                ]);
            }
        }
        if (m.child && !m.menu) {
            issue(`${m.name} names a menu row without its menu`, [
                "modules",
                i,
                "child",
            ]);
        }
    });

    c.addons.forEach((a, i) => {
        if (a.kind === "module") {
            if (!a.module || !moduleIds.has(a.module)) {
                issue(`${a.name} must name a module that exists`, [
                    "addons",
                    i,
                    "module",
                ]);
            }
        } else if (a.module !== undefined) {
            issue(`${a.name} adds to a limit, so it names no module`, [
                "addons",
                i,
                "module",
            ]);
        }
        if (a.kind !== "module" && !moduleIds.has(a.kind)) {
            issue(`${a.name} raises ${a.kind}, which isn't in the catalogue`, [
                "addons",
                i,
                "kind",
            ]);
        }
    });
});

export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogInput = z.input<typeof catalogSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Group = z.infer<typeof groupSchema>;
export type CatalogModule = z.infer<typeof moduleSchema>;
export type Cell = z.infer<typeof cellSchema>;
export type IncludedCell = z.infer<typeof includedCellSchema>;
export type ExcludedCell = z.infer<typeof excludedCellSchema>;
export type Addon = z.infer<typeof addonSchema>;
export type Yearly = z.infer<typeof yearlySchema>;
export type Trial = z.infer<typeof trialSchema>;

/** A cell the snapshot leaves out reads as excluded and locked. */
export const MISSING_CELL: ExcludedCell = { inc: false, off: "locked" };

export function cellOf(module: CatalogModule, planId: string): Cell {
    return module.cells[planId] ?? MISSING_CELL;
}

/** Parse a snapshot, throwing a readable error. */
export function parseCatalog(input: unknown): Catalog {
    return catalogSchema.parse(input);
}

/** Validate without throwing: the messages the admin shows next to Publish. */
export function validateCatalog(
    input: unknown,
): { ok: true; catalog: Catalog } | { ok: false; errors: string[] } {
    const r = catalogSchema.safeParse(input);
    if (r.success) return { ok: true, catalog: r.data };
    return {
        ok: false,
        errors: r.error.issues.map((i) =>
            i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
        ),
    };
}
