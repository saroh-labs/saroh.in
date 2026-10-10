import { WHO_CAN_CHANGE } from "@/lib/access/who-can-change";
import { formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import type { SectionKey } from "./editor-sections";
import { LIMITS, SECTION_JUMPS, SECTION_NAMES } from "./editor-sections";

/**
 * The editor's words that depend on who is looking and what the business
 * sells (#525) — pure and client-safe; tested in `editor-labels.test.ts`.
 */

/** Kept here for the editor's importers. The rule is `role-name.ts`. */
export { roleName } from "@/lib/organizations/role-name";

/**
 * The note under the header for someone who can't change the product, after
 * the Editor design. A stock-only role (`inventory:write` without
 * `store:write`) is told the one section it can change.
 */
export function readOnlyBanner(role: string, stockOnly: boolean): string {
    const line = `You're viewing as ${role}. You can read this product but not change it. ${WHO_CAN_CHANGE}`;
    return stockOnly
        ? `${line} Only the Stock section below can be changed.`
        : line;
}

/** Whether this person can change a section: everything, or Stock alone. */
export function maySection(
    key: SectionKey,
    may: { canWrite: boolean; canStock: boolean },
): boolean {
    return may.canWrite || (key === "stock" && may.canStock);
}

/**
 * The Details card's words. A business that sells food (it keeps an
 * allergen list, Settings → Allergens) reads it as the ready line and
 * allergens, as the design does; any other as how to use it and what it is
 * made of. The fields are the same two.
 */
export interface DetailsCopy {
    title: string;
    jump: string;
    how: { label: string; placeholder: string; help: string; field: string };
    materials: { label: string; placeholder: string; field: string };
    saves: string;
}

export function detailsCopy(sellsFood: boolean): DetailsCopy {
    return sellsFood
        ? {
              title: "Ready time and allergens",
              jump: "Ready and allergens",
              how: {
                  label: "When it is ready",
                  placeholder: "Baked each morning. Collect from 7am.",
                  help: "One line under the price. Every size shares it.",
                  field: "When it is ready",
              },
              materials: {
                  label: "Ingredients",
                  placeholder: "Wheat flour, water, salt…",
                  field: "Ingredients",
              },
              saves: "Saves the ready line, ingredients, allergens and how it's fulfilled.",
          }
        : {
              title: SECTION_NAMES.details,
              jump: SECTION_JUMPS.details,
              how: {
                  label: "How to use or care for it",
                  placeholder: "Two drops, morning and night, on clean skin.",
                  help: "One line under the price. Every variant shares it.",
                  field: "How to use",
              },
              materials: {
                  label: "Ingredients or material",
                  placeholder:
                      "Aqua, Ethyl ascorbic acid, Glycerin… — or 100% linen",
                  field: "Ingredients or material",
              },
              saves: "Saves how to use it, what it is made of and how it's fulfilled.",
          };
}

/** Every section's name, with Details named for the business. */
export function sectionNames(sellsFood: boolean): Record<SectionKey, string> {
    return { ...SECTION_NAMES, details: detailsCopy(sellsFood).title };
}

/** The jumps under the header, with Details named for the business. */
export function sectionJumps(sellsFood: boolean): Record<SectionKey, string> {
    return { ...SECTION_JUMPS, details: detailsCopy(sellsFood).jump };
}

// ---- Description's footer (#525), after the Editor design ----

/** What the toolbar offers and why; over the limit, that formatting counts. */
export function descriptionFootnote(over: boolean): string {
    return over
        ? "Over the limit. Formatting counts towards it too."
        : "The shop keeps only this formatting, so it's all the toolbar offers.";
}

/** The words a customer reads: "1 character", "240 characters". */
export function readCount(n: number): string {
    return count(n, "character");
}

/** What the limit counts, the markup: "1,240 of 5,000 characters". */
export function markupCount(n: number): string {
    return `${formatNumber(n)} of ${formatNumber(LIMITS.description)} characters`;
}

/** The line under the editor. */
export function descriptionNote(over: boolean): string {
    return over
        ? `Longer than the ${formatNumber(LIMITS.description)} characters a description can be.`
        : "Shown on the product page.";
}
