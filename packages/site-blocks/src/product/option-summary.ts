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
