import type { TemplateKind } from "./manifest";
import { TEMPLATE_KINDS } from "./manifest";

/**
 * Which templates a business is offered first (industry templates plan, U12;
 * DEC-216): one rule for the workspace's picker and an AI app's
 * `list_templates`, so the two never suggest differently.
 *
 * Words and defaults only (DEC-070, R3): a suggestion orders what is shown
 * first, and nothing here refuses a template.
 */

/** What is being set up (DEC-070), as the API stores it. */
type Kind = "BUSINESS" | "SOLO" | "WORK";

function kindOf(raw: unknown): Kind {
    return raw === "SOLO" || raw === "WORK" ? raw : "BUSINESS";
}

/** A stored trade (DEC-216), or null for anything that isn't one. */
export function tradeOf(raw: unknown): TemplateKind | null {
    return typeof raw === "string" &&
        (TEMPLATE_KINDS as readonly string[]).includes(raw)
        ? (raw as TemplateKind)
        : null;
}

/**
 * The trades a kind of Organization is offered first. A business may be any
 * trade; "Just me" a coach, a practitioner or a creator; "A site for my
 * work" a creator.
 */
const TRADES: Record<Kind, readonly string[]> = {
    BUSINESS: ["salon", "gym", "clinic", "coach", "food", "shop", "other"],
    SOLO: ["coach", "clinic", "creator"],
    WORK: ["creator"],
};

/** The templates for anyone (no `kinds`) a kind is offered first. */
const GENERAL: Record<Kind, readonly string[]> = {
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

/** The modules whose being off holds some of a template's sections back. */
export function gatingModules(template: {
    uses?: readonly string[] | null;
}): string[] {
    return (template.uses ?? []).filter((k) => !NOT_GATING.has(k));
}

export interface SuggestTemplate {
    id: string;
    kinds?: readonly string[] | null;
    uses?: readonly string[] | null;
}

/**
 * Whether a template is suggested for this business: the kind's default,
 * a general template for the kind, or one for a trade the kind covers
 * whose modules are not all off. `modulesOn` null: not known, so the kind
 * alone decides.
 */
export function isSuggested(
    template: SuggestTemplate,
    kind: unknown,
    modulesOn: readonly string[] | null,
    defaultId: string | null,
): boolean {
    const k = kindOf(kind);
    if (template.id === defaultId) return true;
    const kinds = template.kinds ?? [];
    if (kinds.length === 0) return GENERAL[k].includes(template.id);
    if (!kinds.some((t) => TRADES[k].includes(t))) return false;
    const needs = gatingModules(template);
    if (!modulesOn || needs.length === 0) return true;
    return needs.some((key) => modulesOn.includes(key));
}

/**
 * Where a template falls for this business (DEC-216): made for its trade,
 * else suggested by its kind and modules, else also available.
 */
export type TemplateFit = "trade" | "suggested" | "also";

export function templateFit(
    template: SuggestTemplate,
    business: {
        trade: unknown;
        kind: unknown;
        modulesOn: readonly string[] | null;
        defaultId: string | null;
    },
): TemplateFit {
    const trade = tradeOf(business.trade);
    if (trade && trade !== "other" && (template.kinds ?? []).includes(trade)) {
        return "trade";
    }
    return isSuggested(
        template,
        business.kind,
        business.modulesOn,
        business.defaultId,
    )
        ? "suggested"
        : "also";
}

const FIT_ORDER: Record<TemplateFit, number> = {
    trade: 0,
    suggested: 1,
    also: 2,
};

/**
 * The templates in the order a business is offered them: its trade's,
 * then the suggested (the default first), then the rest, each group in the
 * catalogue's order.
 */
export function templatesByFit<T extends SuggestTemplate>(
    templates: readonly T[],
    business: Parameters<typeof templateFit>[1],
): { template: T; fit: TemplateFit }[] {
    return templates
        .map((template, i) => ({
            template,
            fit: templateFit(template, business),
            i,
            first: template.id === business.defaultId ? 0 : 1,
        }))
        .sort(
            (a, b) =>
                FIT_ORDER[a.fit] - FIT_ORDER[b.fit] ||
                a.first - b.first ||
                a.i - b.i,
        )
        .map(({ template, fit }) => ({ template, fit }));
}
