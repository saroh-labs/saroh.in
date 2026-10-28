/*
 * Which sentences are refusals (a role, not a breakage), as each app
 * registers them. Apart from the toast so a screen that mocks the toast
 * still tells a refusal apart (the shared ConfirmDialog asks it too).
 */

type RefusalTest = (message: string) => boolean;
const refusals: RefusalTest[] = [];

/**
 * Teach `showError` which sentences are refusals, wherever they are shown
 * from.
 *
 * Hundreds of call sites only know `showError(res.error)`, and the sentence
 * is all that reaches them. An app registers how to tell its refusals (the
 * merchant app: `isRoleRefusal`) once, on mount, and every one of those
 * call sites then says a refusal through `showRefusal`. Call the returned
 * function to take it back.
 */
export function setRefusalTest(is: RefusalTest): () => void {
    refusals.push(is);
    return () => {
        const at = refusals.indexOf(is);
        if (at !== -1) refusals.splice(at, 1);
    };
}

/** Whether a sentence is a refusal, by the tests an app registered. */
export function isRefusal(message: string): boolean {
    return refusals.some((is) => is(message));
}
