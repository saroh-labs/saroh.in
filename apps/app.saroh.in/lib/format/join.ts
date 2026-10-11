/**
 * The dot between two facts on one line ("2 of 4 done · Sells in person
 * only"), held to the words on either side of it by no-break spaces, so a
 * line that wraps never starts or ends with the dot.
 */
export const FACT_DOT = "\u00a0·\u00a0";

/**
 * Facts on one line, joined by the dot. What is missing is left out with
 * its dot, so no separator ever leads, trails or doubles: one fact reads
 * as itself, none as "".
 */
export function joinFacts(
    ...facts: readonly (string | number | null | undefined | false)[]
): string {
    return facts
        .filter(
            (fact): fact is string | number =>
                fact !== null &&
                fact !== undefined &&
                fact !== false &&
                String(fact).trim() !== "",
        )
        .map((fact) => String(fact).trim())
        .join(FACT_DOT);
}
