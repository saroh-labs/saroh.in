import { VERIFICATION_OTP_EXPIRY_SECONDS } from "@saroh/auth/constants";

/**
 * What the panel says, per page, in one file.
 *
 * Five pages each holding their own version of this is how five voices become
 * five products. The shape belongs to `SplitPanel`; the words belong here.
 *
 * Every line has to be TRUE, which is why some of it departs from the design:
 *
 * - The reset panel's "ends every other session" was a false promise when
 *   this file was written; `revokeSessionsOnPasswordReset` is on now, so it
 *   is true and the design's wording stands. The same sentence appears ON the
 *   form, because this panel is gone below 760px and a consequence that size
 *   cannot live only in the half that disappears.
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
    eyebrow: "Log in",
    heading: "One login, every business you belong to.",
    body: "Your account is yours. The businesses you can reach — your own, and any you have been invited to — all sit behind this one password.",
    points: [
        "Your role can differ in each business",
        // True: log in answers a wrong email and a wrong password alike, and
        // forgot-password replies the same whether or not the address exists.
        "We never say whether an email is registered",
        "Nothing is shared between businesses except you",
    ],
};

export const SIGNUP_PANEL: PanelCopy = {
    eyebrow: "Sign up",
    heading: "An account, not a business.",
    body: "This is you. What you do with Saroh comes after — and if you are here from an invitation, there is no business to create at all.",
    points: [
        "Eight characters or more, and nothing else demanded of the password",
        // True: `requireEmailVerification` issues no session until the code
        // is accepted.
        "Signing up issues no session until the email is verified",
        "Leaving before the code costs nothing — you cannot be signed in yet",
    ],
};

export const VERIFY_PANEL: PanelCopy = {
    eyebrow: "Verify",
    heading: "The code comes before the session.",
    body: "Saroh wants a verified email before anyone is signed in, and has already sent the code — so this is the next step, not a wall in front of a half-made account.",
    points: [
        `The code lasts ${CODE_MINUTES} minutes`,
        "Asking for a new one retires the one before it",
        "Paste all six at once — it spreads across the boxes",
    ],
};

export const FORGOT_PANEL: PanelCopy = {
    eyebrow: "Forgot password",
    heading: "We answer the same either way.",
    body: "Whether or not that address has an account, this page says the same thing. Confirming it would turn the form into a way of checking who has an account here.",
    points: [
        "The link lasts an hour and works once",
        "Using it signs you out on every other device",
        "Your old password keeps working until the new one is set",
    ],
};

export const RESET_PANEL: PanelCopy = {
    eyebrow: "Reset password",
    heading: "Set it, and you are back in.",
    body: "Choosing a new password ends every other session, which is the point if you are here because something felt wrong. Your current password works until the new one is saved.",
    // Two of the three points this panel used to carry are now said on the
    // form itself, where they belong: the length rule is the password field's
    // note, and the sign-out is the line above the button. The panel is gone
    // below 760px, so a consequence cannot live only here — but once it lives
    // on the form, repeating it here is just noise at desk width.
    points: [
        "The link works once, then it is spent",
        "You will log in again with the new one",
        "Nothing else about your account changes",
    ],
};

export const SENT_PANEL: PanelCopy = {
    eyebrow: "Check your email",
    heading: "Nothing has changed yet.",
    body: "Your current password still works. It only changes when you follow the link and set a new one — so a link requested by mistake costs you nothing.",
    points: [
        "Sent to the address you typed, if it has an account",
        "Not there? Look in spam before asking for another",
        "Asking again replaces the previous link",
    ],
};

export const DONE_PANEL: PanelCopy = {
    eyebrow: "Done",
    heading: "Password changed.",
    body: "Every other session has ended, so anything signed in as you elsewhere — including a device you no longer have — has been signed out.",
    points: [
        "The link you used will not work again",
        "Log in with the new password",
        "Nothing else about your account changed",
    ],
};

export const INVITE_PANEL: PanelCopy = {
    eyebrow: "Invitation",
    heading: "You are joining, not starting.",
    body: "Someone has given you a role in their business. You make an account, and that is all — the business already exists, so there is nothing to set up.",
    points: [
        "The role decides what you see and can change",
        "Whoever invited you can change or withdraw it later",
        "You can be in as many businesses as you like",
    ],
};

/** A reset link past its hour, or already used. */
export const EXPIRED_PANEL: PanelCopy = {
    eyebrow: "Reset password",
    heading: "That link has run out.",
    body: "Reset links last an hour and work once. This one is past that, or has already been used — either way nothing has changed and your old password still works.",
    points: [
        "Asking for a new one takes a moment",
        "The old password is untouched until a new one is set",
        "If you did not ask for this, nobody got in — ignore it",
    ],
};

/** The reset page opened with no link at all. */
export const MISSING_PANEL: PanelCopy = {
    eyebrow: "Reset password",
    heading: "This page needs a link.",
    body: "Resetting a password only works from the link in the email, because that link is what proves the request came from the account's owner.",
    points: [
        "Opening the page directly cannot work, by design",
        "Ask for a link and it arrives in a moment",
        "Already have one? Open it from the email rather than typing the address",
    ],
};
