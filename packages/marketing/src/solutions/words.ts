import type { ClaimSwitch } from "@saroh/marketing/feature-switches";

/**
 * Words that may hold a claim the product can't back yet (DEC-221): a
 * sentence is a list of parts, and a part with a `claim` is drawn only
 * while that claim is on. `say` joins what's left.
 */
export type WordPart = string | { text: string; claim: ClaimSwitch };
export type Words = string | readonly WordPart[];

export function say(words: Words, on: (claim: ClaimSwitch) => boolean): string {
    if (typeof words === "string") return words;
    return words
        .filter((p) => typeof p === "string" || on(p.claim))
        .map((p) => (typeof p === "string" ? p : p.text))
        .join(" ")
        .replace(/\s+/g, " ")
        .replace(/ ([.,;:!?])/g, "$1")
        .trim();
}
