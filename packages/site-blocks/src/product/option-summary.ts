/**
 * A product card's options, summed up as the Customer Site design does
 * (DEC-073 #12): "2 sizes", "3 colours" — how many there are and what they
 * are, never the values themselves, which the product page lists.
 *
 * - No options: nothing.
 * - One option on offer: its own name ("500 g"), which is simply what it is.
 * - More: the count and the option's name, pluralised ("2 sizes"). Without a
 *   name (an API before it), "2 options".
 */
export function optionSummary(
    titles: readonly string[],
    optionName: string | null | undefined,
): string {
    const shown = titles.filter((t) => t.trim() !== "");
    if (shown.length === 0) return "";
    if (shown.length === 1) return shown[0] ?? "";
    const name = optionName?.trim() ? optionName.trim() : "option";
    return `${shown.length} ${plural(lowerFirst(name))}`;
}

/**
 * What a shop card's button reads when the product comes in more than one
 * option: "Choose size", by the option's own name, or "Choose options"
 * without one (an API before it) or with a long one. Null with one option
 * or none: there is nothing to choose, and the card adds it to the bag
 * itself.
 *
 * The card never picks for the customer: a size nobody chose is the wrong
 * thing in the bag.
 */
export function chooseLabel(
    titles: readonly string[],
    optionName: string | null | undefined,
): string | null {
    if (titles.filter((t) => t.trim() !== "").length < 2) return null;
    const name = optionName?.trim();
    // A long name ("Gift wrap style") would run under the price beside it.
    return name && name.length <= CHOOSE_NAME_MAX
        ? `Choose ${lowerFirst(name)}`
        : "Choose options";
}

/** The longest option name the card's button spells out. */
export const CHOOSE_NAME_MAX = 10;

/**
 * "Size" → "size", "Colour" → "colour"; an initialism stays as it is
 * ("UK size", "EU size").
 */
function lowerFirst(word: string): string {
    const second = word.charAt(1);
    if (/[A-Z]/.test(second)) {
        return word;
    }
    return word.charAt(0).toLowerCase() + word.slice(1);
}

/**
 * The plural of an option's name, by its last word: "sizes", "colours",
 * "shades", "boxes", "batches", "flavours", "varieties", "pack sizes".
 * A name already plural ("Kids sizes") or with no letters is kept.
 */
export function plural(name: string): string {
    // The last run of letters, found by walking back: the regex that read
    // the same (/^(.*?)([A-Za-z]+)$/) was quadratic on a long name (CodeQL
    // js/polynomial-redos, release #772).
    let start = name.length;
    while (start > 0 && /[A-Za-z]/.test(name.charAt(start - 1))) start--;
    if (start === name.length) return name;
    const head = name.slice(0, start);
    const word = name.slice(start);
    const lower = word.toLowerCase();
    let out: string;
    if (/(?:s|x|z|ch|sh)$/.test(lower)) {
        // Already plural ("sizes", "Kids sizes"), or a word taking "es".
        out =
            /(?:[^s]s)$/.test(lower) && !/(?:ss|us|is)$/.test(lower)
                ? word
                : `${word}es`;
    } else if (/[^aeiou]y$/.test(lower)) {
        out = `${word.slice(0, -1)}ies`;
    } else {
        out = `${word}s`;
    }
    return `${head}${out}`;
}
