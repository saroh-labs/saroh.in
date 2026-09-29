import {
    KIND_WORD,
    hiddenText,
    tagText,
    tagTitle,
} from "@/lib/customer-workspace/attention";

import type { OrderAttentionTag } from "./business-service";
import type { AllergyNote, OrderAttention, OrderAttentionEntry } from "./read";

/**
 * A customer's Needs attention wherever an order shows (B15, R17), after the
 * "Saroh Orders Screen" and "Saroh Order Detail" designs. Pure, so the row,
 * the quick view, Order Detail and the tests share the words.
 *
 * The API decides what a viewer sees: a sensitive entry reaches only a role
 * that may read it, and is otherwise left out (the row) or only counted (the
 * read). Nothing here filters on its own. When the API couldn't read it
 * (`null`), every surface says so — silence reads as "nothing to know".
 */

/** What a row's tag says. */
export type RowAttention =
    | { state: "none" }
    | { state: "unavailable"; text: string; name: string }
    | { state: "shown"; text: string; name: string; title: string };

/** The tag's words when the API couldn't read Needs attention. */
export const ATTENTION_UNAVAILABLE = "Not available";

/**
 * The row's tag, as the design draws it (DEC-067, B15): the first entry's
 * own words ("Sesame") and how many more ("+1"), named in full for a
 * screen reader ("Allergy: Sesame"), so the kind is never colour alone;
 * "Not available" when it couldn't be read; nothing when there is none, or
 * the API is older.
 */
export function rowAttention(row: {
    attention?: OrderAttentionTag[] | null;
}): RowAttention {
    if (row.attention === undefined) return { state: "none" };
    if (row.attention === null) {
        return {
            state: "unavailable",
            text: ATTENTION_UNAVAILABLE,
            name: "Needs attention couldn't be checked",
        };
    }
    if (row.attention.length === 0) return { state: "none" };
    const [first, ...rest] = row.attention as [
        OrderAttentionTag,
        ...OrderAttentionTag[],
    ];
    return {
        state: "shown",
        text: rest.length ? `${first.label} +${rest.length}` : first.label,
        name: row.attention.map(tagText).join(", "),
        title: row.attention.map(tagTitle).join(". "),
    };
}

/**
 * The quick view's lines (B5's panel), one per entry: "Allergy: Sesame." in
 * bold, then its detail.
 */
export function attentionLines(
    attention: OrderAttention | null | undefined,
): { id: string; head: string; detail: string | null }[] {
    return (attention?.entries ?? []).map((e) => ({
        id: e.id,
        head: `${tagText(e)}.`,
        detail: e.detail?.trim() ? e.detail.trim() : null,
    }));
}

/**
 * Order Detail's cards: the customer card's "Needs attention: Sesame,
 * Pregnant" (each entry's own words, DEC-073) and the Visits card's
 * "Allergy: Sesame." (its kind and words); the entries a printed ticket may
 * carry (never a sensitive one), and the line for what this viewer can't
 * see.
 */
export function cardAttention(attention: OrderAttention): {
    entries: {
        id: string;
        /** Its own words, as the customer card shows them: "Sesame". */
        label: string;
        /** Its kind in words, "Allergy", for a screen reader. */
        kind: string;
        /** Its kind and words, "Allergy: Sesame" — never colour alone. */
        text: string;
        title: string;
        /** Left off the printed ticket. */
        sensitive: boolean;
    }[];
    hidden: string | null;
} {
    return {
        entries: attention.entries.map((e) => ({
            id: e.id,
            label: e.label,
            kind: KIND_WORD[e.kind],
            text: tagText(e),
            title: tagTitle(e),
            sensitive: e.sensitive,
        })),
        hidden: hiddenText(
            attention.hiddenSensitiveCount,
            attention.entries.length,
        ),
    };
}

/**
 * The allergy check's input from the order's own read (B15): each Allergy
 * entry that names an allergen, by every allergen of that name in the
 * business, so the exact-allergen match on the lines stays (ADR-008). Null
 * when Needs attention couldn't be read, so the banner says it couldn't
 * check; undefined from an API before B15, and the page reads the notes.
 */
export function allergyNotesOf(
    attention: OrderAttention | null | undefined,
): AllergyNote[] | null | undefined {
    if (attention === undefined) return undefined;
    if (attention === null) return null;
    return attention.entries.flatMap((e: OrderAttentionEntry) => {
        if (e.kind !== "ALLERGY") return [];
        const allergens = e.matchAllergens.length
            ? e.matchAllergens
            : e.allergen
              ? [e.allergen]
              : [];
        if (allergens.length === 0) return [];
        return [
            {
                body: e.detail?.trim()
                    ? `${tagText(e)}. ${e.detail.trim()}`
                    : tagText(e),
                allergens,
            },
        ];
    });
}
