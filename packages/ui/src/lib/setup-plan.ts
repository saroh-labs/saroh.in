/**
 * The plan from nothing to working, in the order it happens, in one place.
 *
 * Signing up and setting up run on two hosts (`accounts.saroh.in` makes the
 * account, `app.saroh.in` sets the business up) but to the person doing them
 * it is one sitting of four short steps. Both apps draw this list in the
 * split shell's panel, and setup's stepper is built from it, so the count
 * and the names can't drift between the two.
 *
 * The account is the first step. The other three are setup's, one question
 * to a screen (DEC-130, amended 11 Oct 2026).
 */
export const SETUP_PLAN = [
    "Make your account",
    "Say what you are setting up",
    "Give it a name and a web address",
    "Pick what to do first",
] as const;

/** How many of the plan's steps are the account's: the rest are setup's. */
export const SETUP_PLAN_ACCOUNT_STEPS = 1;

/** "Four short steps", said wherever the plan is introduced. */
export const SETUP_PLAN_COUNT_WORDS = "Four short steps";

/** Where someone is in a run of steps: "Step 2 of 4". */
export function stepLine(step: number, of: number): string {
    return `Step ${step} of ${of}`;
}
