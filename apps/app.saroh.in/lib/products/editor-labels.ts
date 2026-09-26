import type { SectionKey } from "./editor-sections";
import { LIMITS, SECTION_JUMPS, SECTION_NAMES } from "./editor-sections";

/**
 * The editor's words that depend on who is looking and what the business
 * sells (#525) — pure and client-safe; tested in `editor-labels.test.ts`.
 */

const BUILT_IN_ROLES: Record<string, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

/** A role as the screen names it: the business's own label, else the built-in's. */
export function roleName(org: {
    role?: string | null;
    roleLabel?: string | null;
}): string {
    if (org.roleLabel?.trim()) return org.roleLabel.trim();
    return (org.role && BUILT_IN_ROLES[org.role]) ?? "Member";
}

/**
 * The note under the header for someone who can't change the product, after
 * the Editor design. A stock-only role (`inventory:write` without
 * `store:write`) is told the one section it can change.
 */
export function readOnlyBanner(role: string, stockOnly: boolean): string {
    const line = `You're viewing as ${role}. You can read this product but not change it — an owner or admin can change your role in Team.`;
    return stockOnly
        ? `${line} Only the Stock section below can be changed.`
        : line;
}

/** Why a role that can't see products is stopped at the door. */
export function noAccessLine(role: string, business: string): string {
    return `You're signed in as ${role} in ${business}. That role doesn't include seeing products. An owner or admin can give you access in Team.`;
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
              saves: "Saves the ready line, ingredients and allergens.",
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
              saves: "Saves how to use it and what it is made of.",
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
    return `${n.toLocaleString("en-IN")} ${n === 1 ? "character" : "characters"}`;
}

/** What the limit counts, the markup: "1,240 of 5,000 characters". */
export function markupCount(n: number): string {
    return `${n.toLocaleString("en-IN")} of ${LIMITS.description.toLocaleString("en-IN")} characters`;
}

/** The line under the editor. */
export function descriptionNote(over: boolean): string {
    return over
        ? `Longer than the ${LIMITS.description.toLocaleString("en-IN")} characters a description can be.`
        : "Shown on the product page.";
}
