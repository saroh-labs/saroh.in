import { moduleName } from "@/lib/modules/names";
import { rolledOutKeys } from "@/lib/modules/rollout";
import type { ModuleView } from "@/lib/modules/schema";
import { listWords } from "@/lib/modules/switch-plan";
import type { OrganizationKind } from "@/lib/organizations/kind";
import { kindOf } from "@/lib/organizations/kind";
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

/**
 * The waitlist kinds (`TEMPLATE_KINDS` in `@saroh/templates`) a kind of
 * Organization is offered first. A business may be any trade; "Just me" a
 * coach, a practitioner or a creator; "A site for my work" a creator.
 */
const TRADES: Record<OrganizationKind, readonly string[]> = {
    BUSINESS: ["salon", "gym", "clinic", "coach", "food", "shop", "other"],
    SOLO: ["coach", "clinic", "creator"],
    WORK: ["creator"],
};

/**
 * The templates for anyone (no `kinds`) a kind is offered first, beside its
 * default (`kindDefaults(kind).starterTemplate`).
 */
const GENERAL: Record<OrganizationKind, readonly string[]> = {
    BUSINESS: ["starter"],
    SOLO: ["personal", "writing"],
    WORK: ["portfolio", "writing"],
};

/**
 * Modules a template reads whose sections are laid down only while the
 * module is on. Website is the site itself; Contacts takes the enquiries a
 * form sends whether or not it is on, so neither holds a section back.
 */
const NOT_GATING = new Set(["WEBSITE", "CRM"]);

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

/** The modules whose being off holds some of a template's sections back. */
function gating(template: Pick<Template, "uses">): string[] {
    return (template.uses ?? []).filter((k) => !NOT_GATING.has(k));
}

/**
 * Whether a template is suggested for this business: the kind's default,
 * a general template for the kind, or one for a trade the kind covers
 * whose modules are not all off. Unknown modules suggest on the kind alone.
 */
export function isSuggested(
    template: Pick<Template, "id" | "kinds" | "uses">,
    kind: unknown,
    modules: ModuleStates | null,
    defaultId: string | null,
): boolean {
    const k = kindOf(kind);
    if (template.id === defaultId) return true;
    const kinds = template.kinds ?? [];
    if (kinds.length === 0) return GENERAL[k].includes(template.id);
    if (!kinds.some((t) => TRADES[k].includes(t))) return false;
    const needs = gating(template);
    if (!modules || needs.length === 0) return true;
    return needs.some((key) => modules.on.includes(key));
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

/**
 * What a template shows only once a module is on, said rather than
 * refused: "Its products show once Sell is on." Null when nothing it needs
 * is off, when modules are not known, or when what is off is a module
 * Saroh doesn't offer this business (never named, DEC-057).
 */
export function moduleNote(
    template: Pick<Template, "uses">,
    modules: ModuleStates | null,
): string | null {
    if (!modules) return null;
    const off = gating(template).flatMap((k) => {
        // The module as the rail names it (`lib/modules/names.ts`).
        const rail = moduleName(k);
        const word = USES_WORD[k];
        return rail &&
            word &&
            !modules.on.includes(k) &&
            modules.named.includes(k)
            ? [{ rail, word: word.toLowerCase() }]
            : [];
    });
    if (off.length === 0) return null;
    const what = listWords(off.map((o) => o.word));
    const names = Array.from(new Set(off.map((o) => o.rail)));
    const verb = names.length > 1 ? "are" : "is";
    return `Its ${what} show once ${listWords(names)} ${verb} on.`;
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
