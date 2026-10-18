/**
 * Sign-in help's rules and ledger words (admin console U9), with no imports
 * so the reads, the DTOs and the service share them without pulling in
 * Better Auth.
 */

/** Sign-in codes staff may send one person in {@link CODE_WINDOW_MS}. */
export const CODES_PER_PERSON = 3;
/** Sign-in codes one staff member may send in {@link CODE_WINDOW_MS}. */
export const CODES_PER_STAFF = 20;
/** The window both limits count over: an hour. */
export const CODE_WINDOW_MS = 60 * 60 * 1000;
/** How long the new address's code is held after a change. */
export const EMAIL_CHANGE_HOLD_MS = 24 * 60 * 60 * 1000;

/** The ledger's words for sign-in help (each on `people:sign-in-help`). */
export const SignInHelpAction = {
    CodeSent: "person.sign-in-code.sent",
    CodeFailed: "person.sign-in-code.failed",
    MarkedVerified: "person.email.marked-verified",
    EmailChanged: "person.sign-in-email.changed",
    EmailConfirmed: "person.sign-in-email.confirmed",
} as const;

/**
 * The Users list's chips (R13). Several may be on at once; a person must
 * match every one.
 *
 * - `no-business`: belongs to no business yet;
 * - `unverified`: their email is not verified;
 * - `owners`: owns at least one business;
 * - `joined-this-week`: made their account in the last seven days.
 */
export const PEOPLE_FILTERS = [
    "no-business",
    "unverified",
    "owners",
    "joined-this-week",
] as const;

export type PeopleFilter = (typeof PEOPLE_FILTERS)[number];
