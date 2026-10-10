import {
    VERIFICATION_OTP_EXPIRY_SECONDS,
    VERIFICATION_OTP_LENGTH,
} from "@saroh/auth/constants";

import { isJoining } from "@/lib/joining";

/**
 * What the panel says, per page, in one file.
 *
 * Five pages each holding their own version of this is how five voices become
 * five products. The shape belongs to `SplitPanel`. The words belong here.
 *
 * The person reading is the hero, not the sign-in system (UX audit, 10 Oct):
 * each panel says what Saroh does for them or where they are in the plan, and
 * one line says what happens next. Nothing here explains sessions.
 *
 * Every line has to be TRUE:
 *
 * - The plan's three steps are real. The account is made here, and setup's
 *   one screen names the business and picks what to do first.
 * - Signing up and signing in take a code sent to the address, and no
 *   password. One can be added from the account page.
 * - Resetting a password signs every other device out
 *   (`revokeSessionsOnPasswordReset`). The same sentence appears ON the form,
 *   because this panel is gone below 760px and a consequence that size cannot
 *   live only in the half that disappears.
 * - No claim about price. Billing is not settled on this page.
 *
 * The code's length and lifetime are read from the constants rather than
 * typed, so a sentence cannot drift from the server's answer. No em dashes
 * and no semicolons in anything a person reads (`lib/copy.test.ts`).
 */

const CODE_MINUTES = Math.round(VERIFICATION_OTP_EXPIRY_SECONDS / 60);

/** What Saroh does, in one line. Said on the panel, and under the sign-up heading on a phone. */
export const PROMISE =
    "Sell, take bookings, bill and run your website in one place.";

/** The plan from nothing to working, in the order it happens. */
export const PLAN_STEPS = [
    "Make your account",
    "Name your business",
    "Pick what to do first",
];

export interface PanelCopy {
    eyebrow: string;
    heading: string;
    body: string;
    points?: string[];
    /** The plan as numbered steps, with the one the person is on. */
    steps?: string[];
    currentStep?: number;
}

export const LOGIN_PANEL: PanelCopy = {
    eyebrow: "Sign in",
    heading: "Pick up where you left off.",
    body: "Your orders, bookings, invoices and website are as you left them. One sign-in opens every business you belong to.",
    points: [
        "Your own businesses, and any you were invited to",
        "Your role can differ in each business",
        // True: sign in answers a wrong email and a wrong password alike, and
        // forgot-password replies the same whether or not the address exists.
        "We never say whether an email is registered",
    ],
};

export const SIGNUP_PANEL: PanelCopy = {
    eyebrow: "Sign up",
    heading: PROMISE,
    body: "Three short steps and you are in, with no password to think up. Next, we email you a code to check the address is yours.",
    steps: PLAN_STEPS,
    currentStep: 1,
};

/** Signing up from an invitation: there is no business to name. */
export const SIGNUP_JOIN_PANEL: PanelCopy = {
    eyebrow: "Invitation",
    heading: "Make your account and you are in.",
    body: "The business already exists, so there is nothing to set up. Next, we email you a code to check the address is yours.",
    points: [
        "Use the address the invitation was sent to",
        "No password to think up",
        "Whoever invited you decides what you can see and change",
    ],
};

export const VERIFY_PANEL: PanelCopy = {
    eyebrow: "Check your email",
    heading: "One code and your account is ready.",
    body: `Type the ${VERIFICATION_OTP_LENGTH} digits we emailed you. Next, you name your business.`,
    steps: PLAN_STEPS,
    currentStep: 1,
};

/** Checking the address on the way to an invitation. */
export const VERIFY_JOIN_PANEL: PanelCopy = {
    eyebrow: "Check your email",
    heading: "One code and you are in.",
    body: `Type the ${VERIFICATION_OTP_LENGTH} digits we emailed you. Next, you join the business that invited you.`,
    points: [
        `The code lasts ${CODE_MINUTES} minutes`,
        "Asking for a new one replaces the one before it",
        "Paste it in, or type it from the email",
    ],
};

/** Which page the code step is on: it decides what "next" can promise. */
export type CodeFrom = "sign-up" | "sign-in";

function settingUp(returnTo: string | null | undefined, from: CodeFrom) {
    // Sign-up with nowhere else to go ends in setup. So does a link that
    // carries a plan or an invite there.
    return returnTo ? returnTo.includes("/onboarding") : from === "sign-up";
}

/**
 * What the code step says comes after the code. `returnTo` is where the
 * account lands (already vetted): an invitation, a page they were on their
 * way to, or nothing. Signing in promises nothing about setup.
 */
export function codeNext(
    returnTo: string | null | undefined,
    from: CodeFrom,
): string | undefined {
    if (isJoining(returnTo)) {
        return "Next, you join the business that invited you.";
    }
    if (settingUp(returnTo, from)) return "Next, you name your business.";
    return returnTo ? "Next, you carry on where you were going." : undefined;
}

/** The line under "You're signed in", while the page hands off. */
export function doneLine(
    returnTo: string | null | undefined,
    from: CodeFrom,
): string {
    if (isJoining(returnTo))
        return "Taking you to the business that invited you…";
    if (settingUp(returnTo, from)) return "Taking you to set up your business…";
    return "Taking you to Saroh…";
}

export const FORGOT_PANEL: PanelCopy = {
    eyebrow: "Forgot password",
    heading: "Back in with one link.",
    body: "Tell us the address you signed up with and we email you a link to set a new password. Next, open that email.",
    points: [
        "The link lasts an hour and works once",
        "Your old password keeps working until the new one is set",
        // True, and why the page cannot be used to check who has an account.
        "We reply the same whether or not the address has an account",
    ],
};

export const RESET_PANEL: PanelCopy = {
    eyebrow: "Reset password",
    heading: "Set it, and you are back in.",
    body: "A new password signs you out everywhere else, which is what you want if something felt wrong. Next, you sign in with the new one.",
    // Two of the three points this panel used to carry are said on the form
    // itself, where they belong: the length rule is the password field's
    // note, and the sign-out is the line above the button. The panel is gone
    // below 760px, so a consequence cannot live only here.
    points: [
        "The link works once",
        "Your current password works until the new one is saved",
        "Nothing else about your account changes",
    ],
};

export const SENT_PANEL: PanelCopy = {
    eyebrow: "Check your email",
    heading: "Nothing has changed yet.",
    body: "Your current password still works. It only changes when you follow the link and set a new one, so a link asked for by mistake costs you nothing.",
    points: [
        "Sent to the address you typed, if it has an account",
        "Not there? Look in spam before asking for another",
        "Asking again replaces the previous link",
    ],
};

export const DONE_PANEL: PanelCopy = {
    eyebrow: "Done",
    heading: "Password changed.",
    body: "You are signed out everywhere else, including on any device you no longer have. Next, sign in with the new password.",
    points: [
        "The link you used will not work again",
        "Your old password no longer works",
        "Nothing else about your account changed",
    ],
};

export const INVITE_PANEL: PanelCopy = {
    eyebrow: "Invitation",
    heading: "You are joining, not starting.",
    body: "Someone has given you a role in their business. It already exists, so there is nothing to set up. Next, make your account or sign in.",
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
    body: "Reset links last an hour and work once. This one is past that, or was already used. Nothing has changed and your old password still works.",
    points: [
        "Asking for a new one takes a moment",
        "The old password is untouched until a new one is set",
        "If you did not ask for this, nobody got in and you can ignore it",
    ],
};

/** The reset page opened with no link at all. */
export const MISSING_PANEL: PanelCopy = {
    eyebrow: "Reset password",
    heading: "This page needs a link.",
    body: "A password is reset from the link in the email, because that link is what shows the request came from you. Next, ask for one.",
    points: [
        "Ask for a link and it arrives in a moment",
        "Open it from the email rather than typing the address",
        "Your current password works until then",
    ],
};
