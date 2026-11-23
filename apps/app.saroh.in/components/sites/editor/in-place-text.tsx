"use client";

import type { Section } from "@/lib/sites/service";
import type { EditableTextHost } from "@saroh/site-blocks";
import { TypingBar } from "./inspector/typing-bar";

/**
 * The fields a section's words may be typed into on the canvas (U47d): only
 * those whose block draws the field as written, through an `EditableText`
 * marker in `@saroh/site-blocks`. Anything else a marker sends is ignored.
 */
export const IN_PLACE_FIELDS: Partial<
    Record<Section["type"], readonly string[]>
> = {
    hero: ["heading", "subheading"],
    faq: ["heading", "intro"],
    features: ["heading", "intro"],
    servicesList: ["heading", "intro"],
    contact: ["heading", "intro"],
    testimonials: ["heading"],
};

/** The host the canvas hands a section's markers, or none for its kind. */
export function inPlaceText(
    section: Section | undefined,
    replace: (next: Section) => void,
): EditableTextHost | undefined {
    const fields = section ? IN_PLACE_FIELDS[section.type] : undefined;
    if (!section || !fields) return undefined;
    return {
        onText: (field, text) => {
            if (!fields.includes(field)) return;
            replace({
                ...section,
                content: { ...section.content, [field]: text },
            } as Section);
        },
        bar: (state) => (
            <TypingBar
                {...state}
                // The contract's limits (`section-contract.ts`). A hero's
                // words have none there; its meter reads against 160, the
                // heading limit (D1 · 3, `fix/EBSiteFix`), and stops nothing.
                max={state.field === "intro" ? 600 : 160}
            />
        ),
    };
}
