import { SECTION_LABELS } from "./editor-constants";
import type { HeldBackSection } from "./saveable-sections";

/**
 * The editor's words about sections held back from a save (#328): written
 * for the merchant, and naming the sections so they know what to finish.
 */

/**
 * "the unfinished FAQ section" / "the unfinished FAQ and Contact sections":
 * what is holding the page back, for messages that tell the merchant what to
 * finish.
 */
export function unfinishedPhrase(heldBack: HeldBackSection[]): string {
    const names = heldBack.map((h) => SECTION_LABELS[h.type]);
    const list =
        names.length <= 1
            ? (names[0] ?? "")
            : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    return `the unfinished ${list} section${names.length > 1 ? "s" : ""}`;
}

/**
 * The bar's words when everything saved except unfinished sections, naming
 * them so the merchant knows what is holding publish back.
 */
export function heldBackSummary(heldBack: HeldBackSection[]): string {
    const names = heldBack.map((h) => SECTION_LABELS[h.type]).join(", ");
    const count =
        heldBack.length === 1
            ? "1 section not finished"
            : `${heldBack.length} sections not finished`;
    return `Saved · ${count}: ${names}`;
}
