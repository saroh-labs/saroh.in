import type { TemplateKind } from "@saroh/templates";
import {
    gatingModules,
    isSuggested as sharedIsSuggested,
} from "@saroh/templates";

import { moduleName } from "@/lib/modules/names";
import { rolledOutKeys } from "@/lib/modules/rollout";
import type { ModuleView } from "@/lib/modules/schema";
import { listWords } from "@/lib/modules/switch-plan";
import { businessEditHref } from "@/lib/organizations/business-rows";
import type { Template } from "@/lib/sites/service";

/**
 * The template picker's rules (industry templates plan, U12): which
 * templates are suggested for this business, what each one uses in plain
 * words, and which of its modules are still off.
 *
 * Words and defaults only (DEC-070, R3): "Suggested" narrows what is shown
 * first, and "All" always lists every template; nothing here refuses one.
 * Pure and client-safe, so `/sites/new` and the Turn on sheet share it.
 */

/** What a template's sections show from a module, as a card says it. */
const USES_WORD: Partial<Record<string, string>> = {
    COMMERCE: "Products",
    APPOINTMENTS: "Bookings",
    COURSES: "Courses",
    CLASS_PACKS: "Class packs",
    PAYMENTS: "Plans",
    CRM: "Enquiries",
};

/** What a template is built around, as a card's tag says it. */
const SHAPE_WORD: Partial<Record<string, string>> = {
    store: "Shop",
    services: "Services",
    journal: "Journal",
    portfolio: "Portfolio",
    docs: "Docs",
};

/**
 * The business's modules as the picker needs them; null: not known. Plain
 * arrays, so the page hands them to the client form as they are.
 */
export interface ModuleStates {
    /** Switched on. */
    on: readonly string[];
    /** Saroh offers it to this business, so it may be named (DEC-057). */
    named: readonly string[];
}

/** From `GET /modules`; null (couldn't be read) stays "not known". */
export function moduleStates(
    modules: readonly ModuleView[] | null | undefined,
): ModuleStates | null {
    if (!modules || modules.length === 0) return null;
    return {
        on: modules.filter((m) => m.lifecycle === "ENABLED").map((m) => m.key),
        named: Array.from(rolledOutKeys(modules)),
    };
}

/**
 * As {@link moduleStates}, with `turningOn` counted as on: what the Turn on
 * sheet is about to switch on with the website.
 */
export function moduleStatesWith(
    modules: readonly ModuleView[] | null | undefined,
    turningOn: readonly string[],
): ModuleStates | null {
    const states = moduleStates(modules);
    if (!states) return null;
    return {
        ...states,
        on: Array.from(new Set([...states.on, ...turningOn])),
    };
}

/**
 * Whether a template is suggested for this business: the shared rule
 * (`@saroh/templates`, DEC-216), which an AI app's `list_templates` reads
 * too. Unknown modules suggest on the kind alone.
 */
export function isSuggested(
    template: Pick<Template, "id" | "kinds" | "uses">,
    kind: unknown,
    modules: ModuleStates | null,
    defaultId: string | null,
): boolean {
    return sharedIsSuggested(template, kind, modules?.on ?? null, defaultId);
}

/** The suggested templates, the default first, then the catalogue's order. */
export function suggestedTemplates<
    T extends Pick<Template, "id" | "kinds" | "uses">,
>(
    templates: readonly T[],
    kind: unknown,
    modules: ModuleStates | null,
    defaultId: string | null,
): T[] {
    const shown = templates.filter((t) =>
        isSuggested(t, kind, modules, defaultId),
    );
    const first = shown.findIndex((t) => t.id === defaultId);
    return first > 0
        ? [shown[first], ...shown.filter((_, i) => i !== first)]
        : shown;
}

/** "Uses Products and Bookings"; null when it uses nothing to name. */
export function usesLine(template: Pick<Template, "uses">): string | null {
    const words = (template.uses ?? []).flatMap((k) => {
        const w = USES_WORD[k];
        return w ? [w] : [];
    });
    return words.length > 0 ? `Uses ${listWords(words)}` : null;
}

/** "Shop", "Services"…: what the site is built around; null: not said. */
export function shapeWord(template: Pick<Template, "shape">): string | null {
    return (template.shape && SHAPE_WORD[template.shape]) ?? null;
}

/** A module a template reads that the business has off, as it is named. */
interface OffModule {
    /** As the rail names it: "Bookings". */
    rail: string;
}

/**
 * The modules a template reads that are off, each one Saroh offers this
 * business (never naming one it doesn't, DEC-057). Empty when nothing it
 * needs is off, or the modules are not known.
 */
function offModules(
    template: Pick<Template, "uses">,
    modules: ModuleStates | null,
): OffModule[] {
    if (!modules) return [];
    return gatingModules(template).flatMap((k) => {
        // The module as the rail names it (`lib/modules/names.ts`).
        const rail = moduleName(k);
        return rail &&
            USES_WORD[k] &&
            !modules.on.includes(k) &&
            modules.named.includes(k)
            ? [{ rail }]
            : [];
    });
}

/** "Bookings", "Bookings and Sell": the modules off, once each. */
function offNames(off: readonly OffModule[]): string[] {
    return Array.from(new Set(off.map((o) => o.rail)));
}

/**
 * Why a template's card is in the group of those that need a module
 * (DEC-216), said rather than refused: "Uses Bookings: turn it on to use
 * this". Null when nothing it needs is off, or modules are not known.
 */
export function offReason(
    template: Pick<Template, "uses">,
    modules: ModuleStates | null,
): string | null {
    const names = offNames(offModules(template, modules));
    if (names.length === 0) return null;
    const it = names.length > 1 ? "them" : "it";
    return `Uses ${listWords(names)}: turn ${it} on to use this`;
}

/**
 * Settings › Business with its Kind of place sheet open (DEC-216): where
 * "Set it" beside an untraded "Suggested" goes.
 */
export const SET_TRADE_HREF = businessEditHref("trade");

/** Who a trade's suggestions are for, as "Suggested for …" ends. */
const TRADE_WORDS: Record<TemplateKind, string | null> = {
    salon: "salons",
    gym: "gyms",
    clinic: "clinics",
    coach: "coaches",
    food: "food businesses",
    shop: "shops",
    creator: "creators",
    other: null,
};

/** "Suggested for salons"; "Suggested" with no trade to name. */
export function suggestedTitle(trade: TemplateKind | null): string {
    const words = trade ? TRADE_WORDS[trade] : null;
    return words ? `Suggested for ${words}` : "Suggested";
}

/** What the picker's suggestions are worked out from. */
export interface SuggestionBasis {
    /** The business's trade (DEC-216); null falls back to its kind's rules. */
    trade: TemplateKind | null;
    /** What is being set up (DEC-070). */
    kind: unknown;
    modules: ModuleStates | null;
    /** The kind's template (`kindDefaults(kind).starterTemplate`). */
    defaultId: string | null;
}

/**
 * Whether a template is suggested (DEC-216): with a trade, the trade's own
 * templates, the kind's default and its templates for anyone (Starter for a
 * business); without one, {@link isSuggested}.
 */
export function isSuggestedFor(
    template: Pick<Template, "id" | "kinds" | "uses">,
    basis: SuggestionBasis,
): boolean {
    const { trade, kind, modules, defaultId } = basis;
    // "Something else" names no trade's templates: the kind's rule.
    if (!trade || trade === "other") {
        return isSuggested(template, kind, modules, defaultId);
    }
    const kinds = template.kinds ?? [];
    // The default and the kind's templates for anyone, as the shared rule
    // says them, beside the trade's own.
    if (template.id === defaultId || kinds.length === 0) {
        return isSuggested(template, kind, modules, defaultId);
    }
    return kinds.includes(trade);
}

/** One heading of the picker and the templates under it. */
export interface TemplateGroup<T> {
    key: string;
    title: string;
    templates: T[];
}

/**
 * The picker's groups (DEC-216, board D3): "Suggested for <trade>" first,
 * the default leading; then the rest whose modules are on, "Made for other
 * trades"; then those that need a module that is off, one group per set of
 * modules ("Need Sell"), each card saying why. Every template is in exactly
 * one group, in the catalogue's order within it; an empty group is left out.
 */
export function templateGroups<
    T extends Pick<Template, "id" | "kinds" | "uses">,
>(templates: readonly T[], basis: SuggestionBasis): TemplateGroup<T>[] {
    const suggested = templates.filter((t) => isSuggestedFor(t, basis));
    const first = suggested.findIndex((t) => t.id === basis.defaultId);
    const lead =
        first > 0
            ? [suggested[first], ...suggested.filter((_, i) => i !== first)]
            : suggested;
    const rest = templates.filter((t) => !suggested.includes(t));
    const needs = new Map<string, T[]>();
    const others: T[] = [];
    for (const t of rest) {
        const names = offNames(offModules(t, basis.modules));
        if (names.length === 0) {
            others.push(t);
            continue;
        }
        const key = listWords(names);
        needs.set(key, [...(needs.get(key) ?? []), t]);
    }
    const groups: TemplateGroup<T>[] = [
        {
            key: "suggested",
            title: suggestedTitle(basis.trade),
            templates: lead,
        },
        {
            key: "others",
            title: "Made for other trades",
            templates: others,
        },
        ...Array.from(needs, ([names, list]) => ({
            key: `need:${names}`,
            title: `Need ${names}`,
            templates: list,
        })),
    ];
    return groups.filter((g) => g.templates.length > 0);
}

/**
 * The template the picker starts on: the one asked for in the address
 * (`?template=`, by id or slug), else the kind's, else the first listed.
 */
export function startingTemplate(
    templates: readonly Pick<Template, "id" | "slug">[],
    asked: string | null | undefined,
    preferred: string | null | undefined,
): string | null {
    const byAsk = asked
        ? templates.find((t) => t.id === asked || t.slug === asked)
        : undefined;
    if (byAsk) return byAsk.id;
    if (preferred && templates.some((t) => t.id === preferred)) {
        return preferred;
    }
    return templates[0]?.id ?? null;
}
