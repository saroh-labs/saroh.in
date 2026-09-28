/**
 * Settings › Activity's words for a person's extra permissions (F17,
 * `membership.extras.update`): "gave Ravi Refund orders", "took See invoices
 * away from Ravi". The event carries each permission's label as it was
 * called when it happened (`givenLabels`, `takenLabels`), so the line reads
 * in the owner's words and never as a code.
 */

/** A metadata field that should be a list of words, or empty. */
function labels(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string" && v !== "")
        : [];
}

function listed(words: readonly string[]): string {
    return new Intl.ListFormat("en", { type: "conjunction" }).format(words);
}

/** The rest of the sentence after who did it. */
export function extrasWhat(
    whom: string,
    meta: Record<string, unknown>,
): string {
    const given = labels(meta.givenLabels);
    const taken = labels(meta.takenLabels);
    if (given.length > 0 && taken.length > 0) {
        return `changed ${whom}’s extra permissions: gave ${listed(given)}, took away ${listed(taken)}`;
    }
    if (given.length > 0) return `gave ${whom} ${listed(given)}`;
    if (taken.length > 0) return `took ${listed(taken)} away from ${whom}`;
    return `changed ${whom}’s extra permissions`;
}

/** The detail sheet's rows: "Given" and "Taken away", each as a list. */
export function extrasRows(
    meta: Record<string, unknown>,
): { label: string; value: string }[] {
    const given = labels(meta.givenLabels);
    const taken = labels(meta.takenLabels);
    return [
        ...(given.length > 0 ? [{ label: "Given", value: listed(given) }] : []),
        ...(taken.length > 0
            ? [{ label: "Taken away", value: listed(taken) }]
            : []),
    ];
}
