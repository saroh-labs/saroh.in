import type { PersonRow, SignInState } from "./people";

/**
 * Sign-in in words for the Users screens (admin console U9). Client-safe:
 * types only from `people.ts`.
 */

/** A person's name, or their email when they have none. */
export function displayName(person: { name: string | null; email: string }) {
    const name = person.name?.trim() ?? "";
    return name.length > 0 ? name : person.email;
}

/** How their email came to be verified, in a few words. */
export function verifiedWords(verifiedBy: PersonRow["verifiedBy"]): string {
    if (verifiedBy === "self") return "Verified by them";
    if (verifiedBy === "staff") return "Marked verified by Saroh staff";
    return "Not verified";
}

export interface SignInBanner {
    title: string;
    body: string;
}

/**
 * The Overview's banner when something stops them signing in, with the
 * reason in words; null when nothing does. `formatWhen` writes a time the
 * console's way.
 */
export function signInBanner(
    signIn: SignInState,
    formatWhen: (iso: string) => string,
): SignInBanner | null {
    if (signIn.block === "held" && signIn.lastChange) {
        const by = signIn.lastChange.requestedByName ?? "a staff member";
        return {
            title: "They can't sign in yet",
            body: `${by} changed their sign-in email. To keep the account safe, no sign-in code goes to the new address and no sign-in works until ${formatWhen(signIn.lastChange.codeHeldUntil)}, unless a second staff member confirms the change.`,
        };
    }
    if (signIn.block === "unverified") {
        return {
            title: "Their email isn't verified",
            body: "A password won't sign them in until they enter the code that signing in emails them. Send a sign-in code, or mark the email verified once you've checked it's theirs.",
        };
    }
    return null;
}

/** The sign-in code limit, in words: "1 of 3 sent this hour". */
export function codesWords(signIn: SignInState): string {
    return `${signIn.codesThisHour} of ${signIn.codesPerHour} sent this hour`;
}

/**
 * Whether this staff member may confirm the held change: anyone with sign-in
 * help but the one who made it. The API decides; this hides the button.
 */
export function mayConfirmChange(
    signIn: SignInState,
    staffUserId: string,
): boolean {
    return (
        signIn.lastChange?.held === true &&
        signIn.lastChange.requestedByUserId !== staffUserId
    );
}

/** What staff did, as the History tab says it. */
const HISTORY_WORDS: Record<string, string> = {
    "person.sign-in-code.sent": "Sent a sign-in code",
    "person.sign-in-code.failed": "Tried to send a sign-in code; it failed",
    "person.email.marked-verified": "Marked their email verified",
    "person.sign-in-email.changed": "Changed their sign-in email",
    "person.sign-in-email.confirmed": "Confirmed the sign-in email change",
    "person.sessions.ended": "Signed them out everywhere",
    "person.role.changed": "Changed their role in a business",
    "person.removed": "Removed them from a business",
};

/**
 * One History line's words. A refusal or failure keeps the same words; the
 * line's badge says it didn't happen.
 */
export function historyWords(action: string): string {
    const words = HISTORY_WORDS[action];
    if (words) return words;
    const plain = action.replace(/^person\./, "").replace(/[._-]+/g, " ");
    return plain.charAt(0).toUpperCase() + plain.slice(1);
}
