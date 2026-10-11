/**
 * The mark for a value that isn't there: one dash, written in this file and
 * nowhere else. A cell, a stat tile, a row's meta and a quick look draw it
 * through `AbsentValue` (`@saroh/ui/absent-value`), which hides the dash
 * from a screen reader and says the word instead ("None", "Not set", "Not
 * known"). `absentText()` is its twin for a place that can only hold a
 * plain string: a `title`, an option's label, a line built from parts.
 *
 * The merchant app's copy check (`scripts/check-app-copy.mjs`) fails an em
 * dash typed anywhere else, so the mark can't drift into punctuation.
 *
 * A plain module, not a client one, so a `lib/` function and a server
 * component can call it.
 */
export const ABSENT_MARK = "—";

/** The dash, for a place that can only hold a plain string. */
export function absentText(): string {
    return ABSENT_MARK;
}

/** Whether a drawn value is the absent mark, or nothing at all. */
export function isAbsentText(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    return typeof value === "string" && (value === "" || value === ABSENT_MARK);
}
