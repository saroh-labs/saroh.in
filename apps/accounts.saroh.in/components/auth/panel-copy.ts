import { VERIFICATION_OTP_EXPIRY_SECONDS } from "@saroh/auth/constants";

/**
 * What the panel says, per page, in one file.
 *
 * Five pages each holding their own version of this is how five voices become
 * five products. The shape belongs to `SplitPanel`; the words belong here.
 *
 * Every line has to be TRUE, which is why some of it departs from the design:
 *
 * - The reset panel is drawn as "Saving this signs you out everywhere else."
 *   We never set `revokeSessionsOnPasswordReset`, so other sessions survive a
 *   reset — the drawn line would be a false promise on the one screen where
 *   someone is already worried about who else is signed in.
 * - The sign-up panel is drawn with a pricing claim. Billing is not settled
 *   here, and a claim about money on the page where an account is created is
 *   the worst place to be approximately right.
 *
 * The code's lifetime is read from the constant rather than typed, so the
 * sentence cannot drift from the server's answer.
 */

const CODE_MINUTES = Math.round(VERIFICATION_OTP_EXPIRY_SECONDS / 60);

export interface PanelCopy {
    eyebrow: string;
    heading: string;
    body: string;
    points: string[];
}

export const LOGIN_PANEL: PanelCopy = {
    eyebrow: "Welcome back",
    heading: "One account, every business you belong to.",
    body: "Switch between them from the top of the workspace — your role can differ in each, and the sidebar changes with it.",
    points: [
        "A bookkeeper can hold read-only access in a dozen businesses",
        "Nothing is shared between them except you",
        "GitHub and Google work too, if that is how you signed up",
    ],
};

export const SIGNUP_PANEL: PanelCopy = {
    eyebrow: "New to Saroh",
    heading: "A shop, a site, a diary — whichever of those you are.",
    body: "You choose what the business needs after the account exists. Nothing is switched on that you did not ask for.",
    points: [
        "One account can hold as many businesses as you need",
        "Capabilities go on and off later without losing anything",
        "Your name is what your team sees when you invite them",
    ],
};

export const VERIFY_PANEL: PanelCopy = {
    eyebrow: "One step left",
    heading: "The account exists. The session does not.",
    body: "Saroh will not sign anyone in on an address nobody has confirmed — so this is a step rather than a reminder you can dismiss.",
    points: [
        `The code lasts ${CODE_MINUTES} minutes`,
        "Asking for a new one retires the old",
        "If you were invited, you land on that business, not your own setup",
    ],
};

export const FORGOT_PANEL: PanelCopy = {
    eyebrow: "Locked out",
    heading: "This page will not tell anyone whether an account exists.",
    body: "The confirmation reads the same either way, deliberately, so nobody can use it to find out who is registered with Saroh.",
    points: [
        "Your current password keeps working until a new one is saved",
        "Asking twice is harmless",
        "Check spam before asking again",
    ],
};

export const RESET_PANEL: PanelCopy = {
    eyebrow: "Almost done",
    heading: "One link, one use.",
    body: "This link is spent once a password is saved with it. If it has expired, ask for another from the log-in page — nothing is lost by asking twice.",
    points: [
        "Eight characters minimum",
        "Your current password works until the new one is saved",
        "You will be asked to log in again with the new one",
    ],
};
