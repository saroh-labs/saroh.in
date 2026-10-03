/**
 * The opening-day invite as onboarding carries it (marketing plan U31): a
 * business made through an invite takes the launch offer instead of a
 * checkout. Pure: the calls are in `./invite-intent.ts` (reading it) and
 * `./checkout-actions.ts` (taking it once the business exists).
 *
 * The offer's plan and length come from the API at run time; nothing here
 * names either.
 */

export type InviteIntent =
    /** No invite in the link. */
    | { kind: "none" }
    /** The API says this account can use it. */
    | {
          kind: "ready";
          token: string;
          businessName: string | null;
          planName: string;
          days: number;
      }
    /** The API couldn't be asked; it is tried once the business exists. */
    | { kind: "unchecked"; token: string }
    /** It can't be used, in the API's words ("ask for a new invite"). */
    | { kind: "refused"; message: string };

/** The answer `POST /waitlist/invite/check` gives, as far as this reads it. */
export interface InviteCheckAnswer {
    status: string;
    message?: string;
    businessName?: string | null;
    planKey?: string;
    days?: number;
}

/** An invite token's shape; anything else is no invite. */
export const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** What the API's answer means for onboarding. */
export function inviteIntentFrom(
    token: string,
    answer: InviteCheckAnswer | null,
): InviteIntent {
    if (!answer) return { kind: "unchecked", token };
    if (
        answer.status === "ready" &&
        typeof answer.planKey === "string" &&
        typeof answer.days === "number"
    ) {
        return {
            kind: "ready",
            token,
            businessName: answer.businessName ?? null,
            planName: planName(answer.planKey),
            days: answer.days,
        };
    }
    return {
        kind: "refused",
        message:
            answer.message ??
            "This invite can't be used. Ask for a new invite.",
    };
}

/** A catalogue plan id as a name: `grow` → "Grow". */
function planName(planKey: string): string {
    return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

/** What onboarding says about the invite, or null when there is none. */
export function inviteNote(intent: InviteIntent): string | null {
    switch (intent.kind) {
        case "ready":
            return `Your invite: ${intent.planName} for ${intent.days} days from when this is set up, with no payment details. Nothing is charged; when it ends you're on Free unless you choose a plan.`;
        case "unchecked":
            return "Your invite is applied once this is set up.";
        case "refused":
            return `${intent.message} You can still set up, on Free.`;
        default:
            return null;
    }
}

/** The token to take the offer with once the business exists, if any. */
export function inviteToTake(intent: InviteIntent): string | null {
    return intent.kind === "ready" || intent.kind === "unchecked"
        ? intent.token
        : null;
}

export const LAUNCH_OFFER_FAILED =
    "The launch offer couldn't be applied, so it's on Free for now. Ask us and we'll add it.";
