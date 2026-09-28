/**
 * The business's public phone (DEC-053): the number its website shows, with
 * a Call button. The API stores it as E.164 ("+919845012345") and is the
 * judge (`organizations/business-phone.ts` there); this says the same rule
 * on the field as the merchant types, so Save isn't the first to know.
 */
const E164 = /^\+[1-9]\d{7,14}$/;
const SEPARATORS = /[\s\-.()]/g;

export const PHONE_EXAMPLE = "+91 98450 12345";

/** What is wrong with a typed number, or null when it will be accepted. */
export function phoneProblem(typed: string): string | null {
    const trimmed = typed.trim();
    if (trimmed === "") return null;
    const compact = trimmed.replace(SEPARATORS, "");
    if (!compact.startsWith("+")) {
        return `Start with + and the country code, like ${PHONE_EXAMPLE}.`;
    }
    if (!E164.test(compact)) {
        return `That isn't a number a customer can call. Use + and the country code, like ${PHONE_EXAMPLE}.`;
    }
    if (compact.startsWith("+91") && compact.length !== 13) {
        return "An Indian number is +91 and then 10 digits.";
    }
    return null;
}

/**
 * A stored number as a person reads it: an Indian one grouped
 * "+91 98450 12345", any other as stored.
 */
export function phoneLabel(stored: string | null | undefined): string {
    if (!stored) return "";
    const india = /^\+91(\d{5})(\d{5})$/.exec(stored);
    return india ? `+91 ${india[1]} ${india[2]}` : stored;
}
