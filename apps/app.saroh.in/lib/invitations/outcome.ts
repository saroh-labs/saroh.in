/**
 * What an invitation that could not be accepted says, for both kinds: a
 * business's (`/join/:token`) and a location's (`/invitations/:token`).
 *
 * The two pages used to show whatever came back under one heading, and a
 * failure to reach the API read as "This invitation cannot be used", which
 * is not true: nothing was checked (UX audit, 10 Oct). Four states now, each
 * with its own way on:
 *
 * - `unreachable`: Saroh did not answer. Try again.
 * - `gone`: withdrawn, used, expired or never existed. One title for all
 *   four, the same one accounts shows before sign-in
 *   (`apps/accounts.saroh.in/lib/invitations.ts`, kept equal by the test).
 * - `wrong-person`: signed in as someone it was not sent to. Sign out and
 *   use the right address, or go to Home.
 * - `refused`: anything else the API said no to, in the API's own words
 *   (the plan has no room, the inviter may no longer invite).
 *
 * Pure: no imports, so the pages and their tests share it.
 */

export type InvitationProblem =
    "unreachable" | "gone" | "wrong-person" | "refused";

/** An accept's outcome, keeping the status a failure came back with. */
export type InvitationAccept<T> =
    | { ok: true; data: T }
    | {
          ok: false;
          /** The API's guarded message, for the `refused` state only. */
          error: string;
          /** The HTTP status, or null when the API never answered. */
          status: number | null;
      };

/** The gone state's words, on all three invitation pages. */
export const INVITATION_GONE = {
    title: "This invitation can no longer be used",
    description:
        "It was withdrawn, already used, or has expired. Ask whoever sent it for a new one.",
} as const;

/** The API did not answer, so nothing is known about the invitation. */
export const INVITATION_UNREACHABLE = {
    title: "Couldn't check this invitation",
    description: "Try again in a moment. The invitation itself is untouched.",
} as const;

export const INVITATION_WRONG_PERSON_TITLE =
    "This invitation is for someone else";

export const INVITATION_REFUSED_TITLE = "This invitation couldn't be accepted";

/**
 * The location accept's refusal for the wrong account
 * (`apps/api.saroh.in/src/modules/members/members.service.ts`). That
 * endpoint answers 403 for a second reason too (the inviter may no longer
 * invite), so the sentence is what tells them apart. The test reads the API's
 * source to keep the two equal.
 */
export const LOCATION_WRONG_EMAIL =
    "This invitation was sent to a different email";

/**
 * Which state a failed accept is. `status` is the API's HTTP status, or null
 * when the request never got an answer. `wrongPerson` says whether a 403 is
 * the wrong-account refusal: always for a business's invitation, and only
 * that one sentence for a location's.
 */
export function invitationProblem(
    status: number | null,
    wrongPerson = true,
): InvitationProblem {
    // No answer, ours to fix, told to slow down, or the session lapsed since
    // the page began: nothing was decided about the invitation, and trying
    // again is the way on (a lapsed session is sent to sign in).
    if (status === null || status >= 500 || status === 429 || status === 401) {
        return "unreachable";
    }
    // 404 unknown, withdrawn or used. 400 expired. 410 for good measure.
    if (status === 404 || status === 400 || status === 410) return "gone";
    if (status === 403) return wrongPerson ? "wrong-person" : "refused";
    return "refused";
}

/** The line under "This invitation is for someone else". */
export function wrongPersonDescription(
    invitedEmail: string | null | undefined,
    signedInEmail: string | null | undefined,
): string {
    const sent = invitedEmail
        ? `It was sent to ${invitedEmail}.`
        : "It was sent to a different email address.";
    const you = signedInEmail ? ` You are signed in as ${signedInEmail}.` : "";
    return `${sent}${you} Only the person it was sent to can accept it.`;
}

/** The button that signs out and starts again as the invited address. */
export function switchAccountLabel(
    invitedEmail: string | null | undefined,
): string {
    return invitedEmail
        ? `Sign out and use ${invitedEmail}`
        : "Sign out and use another email";
}
