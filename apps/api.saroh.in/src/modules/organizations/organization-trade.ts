import type { TemplateKind } from "@saroh/templates";
import {
    getTemplate,
    listTemplates,
    TEMPLATE_KINDS,
    tradeOf,
} from "@saroh/templates";

/**
 * The kind of place a business is (DEC-216): one of the template kinds, or
 * null when never said. Setup asks it and Settings › Business changes it.
 * It picks the website templates and sample services offered first, and
 * nothing else: no guard, module gate or entitlement reads it.
 */
export const ORGANIZATION_TRADES = TEMPLATE_KINDS;
export type OrganizationTrade = TemplateKind;

/** A stored trade as the API answers it; anything else reads as not said. */
export function tradeRead(raw: string | null | undefined): TemplateKind | null {
    return tradeOf(raw);
}

/** Longer than any template id or slug; anything past it is not one. */
const MAX_TEMPLATE = 64;

/**
 * The gallery template carried through sign-up (`?template=`, DEC-216), as
 * the id kept on the business: a known template's id or slug, else null.
 * Never refused: a bad link can't stop a business being made.
 */
export function startTemplateOf(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const asked = raw.trim();
    if (!asked || asked.length > MAX_TEMPLATE) return null;
    if (getTemplate(asked)) return asked;
    return listTemplates().find((t) => t.slug === asked)?.id ?? null;
}

/** The typed trade's length (DEC-216, 12 Nov 2026): "Bakery", "Tailor". */
export const TRADE_OTHER_MIN = 2;
export const TRADE_OTHER_MAX = 60;

/** The typed trade as the API answers it: only beside trade "other". */
export function tradeOtherRead(
    trade: string | null | undefined,
    raw: string | null | undefined,
): string | null {
    return tradeOf(trade) === "other" && raw ? raw : null;
}

/**
 * What a save writes to `tradeOther`, given what was sent and the trade
 * stored before it: the typed trade while the trade is (or becomes)
 * "other", and null once it is anything else. Nothing when neither was sent.
 */
export function tradeOtherWrite(
    sent: { trade?: string | null; tradeOther?: string | null },
    stored: string | null | undefined,
): { tradeOther?: string | null } {
    if (sent.trade === undefined && sent.tradeOther === undefined) return {};
    const trade = sent.trade !== undefined ? sent.trade : tradeOf(stored);
    if (trade !== "other") return { tradeOther: null };
    return sent.tradeOther !== undefined ? { tradeOther: sent.tradeOther } : {};
}
