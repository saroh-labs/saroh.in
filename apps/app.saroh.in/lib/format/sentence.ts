/**
 * A word that opens a sentence, capitalised: `"the customer"` → `"The
 * customer"`. Copy that names a person by first name falls back to "the
 * customer" when there is no name, and a sentence must not start lowercase
 * (#837). A name already capitalised is left as it is.
 */
export function sentenceStart(words: string): string {
    return words.charAt(0).toUpperCase() + words.slice(1);
}
