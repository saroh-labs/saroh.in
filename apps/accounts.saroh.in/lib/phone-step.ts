/**
 * "Add your phone" after sign-in and sign-up (DEC-196), while the platform
 * switch `PHONE_REQUIRED_FOR_ACCOUNTS` is on. The switch is the API's
 * (`GET /account-phone/options` → `required`), read on this app's server;
 * the browser only carries the answer to where it goes next.
 *
 * Off, nothing here runs: every sign-in goes where it always did.
 *
 * Kept free of imports so its test can load it.
 */

/** The step's page on this app. */
export const PHONE_STEP_PATH = "/add-phone";

/**
 * Where a sign-in goes instead of `destination` while the switch is on: the
 * step, carrying the destination. Absolute, because a social sign-in's
 * callback is followed from the API's origin. The step itself decides,
 * on the server, whether this person must stop there.
 */
export function throughPhoneStep(
    destination: string,
    accountsUrl: string,
    required: boolean,
): string {
    if (!required) return destination;
    return `${accountsUrl}${PHONE_STEP_PATH}?${new URLSearchParams({ to: destination }).toString()}`;
}

export type PhoneStepVerdict =
    /** Ask for a phone; they may sign out, never skip. */
    | "ask"
    /** Nothing to ask: go on. */
    | "pass"
    /** Required, but codes can't be sent now: go on, and it is asked again next sign-in. */
    | "pass-unavailable";

/**
 * Whether this signed-in person stops at the step. Saroh's own staff never
 * do (their console, support access), nor anyone heading to the console:
 * a missing phone must never stand between support and a business.
 */
export function phoneStepVerdict(input: {
    required: boolean;
    available: boolean;
    phoneVerified: boolean;
    staff: boolean;
}): PhoneStepVerdict {
    if (!input.required || input.phoneVerified || input.staff) return "pass";
    return input.available ? "ask" : "pass-unavailable";
}
