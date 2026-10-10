import {
    CODE_RESEND_SECONDS,
    VERIFICATION_OTP_EXPIRY_SECONDS,
    VERIFICATION_OTP_LENGTH,
} from "@saroh/auth/constants";

import type { AuthFailure } from "./auth-error-copy";
import { authErrorCode, authFailureCopy, settle } from "./auth-error-copy";

/**
 * Signing up and signing in with an emailed code (owner, 10 Oct 2026): what
 * the two steps ask of the auth server and what they say back, with nothing
 * of React in it so every answer can be tested.
 *
 * One flow for a new address and a returning one. Asking for a code answers
 * the same either way, the same email arrives, and the right code makes the
 * account if there was none. Nothing here says which it was.
 *
 * The words are the customer site's sign-in sheet's
 * (`packages/site-blocks/src/account/sign-in-sheet.tsx`), so a merchant and
 * their customers meet one code step: "Code", "Resend code in 24s",
 * "Change email", "Send a new code".
 */

/** The code's lifetime in minutes, from the server's own constant. */
export const CODE_MINUTES = Math.round(VERIFICATION_OTP_EXPIRY_SECONDS / 60);

/** The code step's words, in one place. */
export const CODE_WORDS = {
    title: "Check your email",
    label: "Code",
    placeholder: "• • • • • •",
    submit: "Sign in",
    checking: "Checking…",
    resend: "Resend code",
    sendNew: "Send a new code",
    changeEmail: "Change email",
    spam: "Not there? Look in spam.",
    signedIn: "You're signed in",
} as const;

/** "We sent a 6-digit code to asha@example.com. It lasts 10 minutes." */
export function codeLead(email: string): string {
    return `We sent a ${VERIFICATION_OTP_LENGTH}-digit code to ${email}. It lasts ${CODE_MINUTES} minutes.`;
}

/** "Resend code in 24s", or "Resend code" once it may be pressed. */
export function resendLabel(waitSeconds: number): string {
    return waitSeconds > 0
        ? `${CODE_WORDS.resend} in ${waitSeconds}s`
        : CODE_WORDS.resend;
}

/** Digits only, at most the code's length: a paste with spaces still fits. */
export function codeDigits(value: string): string {
    return value.replace(/\D/g, "").slice(0, VERIFICATION_OTP_LENGTH);
}

/** Good enough to send: the API decides whether it is an address. */
export function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Whole seconds left before Resend, 0 when it may be pressed. */
export function resendWait(resendAt: number | null, now: number): number {
    if (resendAt === null) return 0;
    return Math.max(0, Math.ceil((resendAt - now) / 1_000));
}

/**
 * The wait the server named when it refused (`X-Retry-After`, seconds), when
 * it is a wait at all. Anything else falls back to the usual one.
 */
export function waitFromServer(header: string | null | undefined): number {
    const seconds = Number(header);
    return header && Number.isFinite(seconds) && seconds > 0
        ? Math.min(Math.ceil(seconds), 10 * 60)
        : CODE_RESEND_SECONDS;
}

/** What a call to the auth server came back with. */
interface Answer {
    error: AuthFailure | null;
    /** The server's `X-Retry-After`, read from a refusal. */
    retryAfter?: string | null;
}

/**
 * The two kinds of code this app asks for. `sign-in` is the way in for
 * everyone. `email-verification` is for a password account whose address was
 * never confirmed: signing in with the password sends that code, and it is
 * checked on the same step.
 */
export type CodeKind = "sign-in" | "email-verification";

/** The auth client, as far as these steps use it. */
export interface CodeClient {
    send: (input: { email: string; kind: CodeKind }) => Promise<Answer>;
    check: (input: {
        email: string;
        code: string;
        kind: CodeKind;
        /** Kept only when the code makes a new account. */
        name?: string;
    }) => Promise<Answer>;
}

export type CodeSent =
    | { ok: true; resendAfterSeconds: number }
    | { ok: false; message: string; resendAfterSeconds: number | null };

/**
 * Ask for a code. The same answer whether or not the address has an account
 * (the server's, kept that way here): `ok` means "Check your email", never
 * "you have an account".
 */
export async function sendCode(
    client: CodeClient,
    input: { email: string; kind?: CodeKind },
): Promise<CodeSent> {
    const email = input.email.trim();
    if (!looksLikeEmail(email)) {
        return {
            ok: false,
            message: authFailureCopy({ code: "INVALID_EMAIL" }),
            resendAfterSeconds: null,
        };
    }
    const answer = await settle<Answer>(() =>
        client.send({ email, kind: input.kind ?? "sign-in" }),
    );
    const { error } = answer;
    const retryAfter = "retryAfter" in answer ? answer.retryAfter : null;
    if (!error) return { ok: true, resendAfterSeconds: CODE_RESEND_SECONDS };
    const limited = authErrorCode(error) === "TOO_MANY_REQUESTS";
    return {
        ok: false,
        message: limited
            ? "Too many codes asked for. Wait a moment, then try again."
            : authFailureCopy(error, "Couldn't send the code. Try again."),
        // Only a refusal for asking too often has a wait to count down.
        resendAfterSeconds: limited ? waitFromServer(retryAfter) : null,
    };
}

export type CodeChecked =
    | { ok: true }
    | {
          ok: false;
          message: string;
          /**
           * The code can't be tried again (it ran out, or took too many
           * wrong tries): the step offers "Send a new code" in place of the
           * countdown.
           */
          spent: boolean;
      };

/** What a wrong, late or worn-out code says, in the customer site's words. */
const CHECK_COPY: Partial<Record<string, { message: string; spent: boolean }>> =
    {
        INVALID_OTP: {
            message: "That code isn't right. Check the email and try again.",
            spent: false,
        },
        OTP_EXPIRED: {
            message: "That code has expired. Send a new one.",
            spent: true,
        },
        TOO_MANY_ATTEMPTS: {
            message: "Too many wrong codes. Send a new one.",
            spent: true,
        },
    };

/**
 * Check a code. `ok` means the session is set: a new address now has an
 * account, a returning one is signed in.
 */
export async function checkCode(
    client: CodeClient,
    input: { email: string; code: string; kind?: CodeKind; name?: string },
): Promise<CodeChecked> {
    const code = codeDigits(input.code);
    if (code.length !== VERIFICATION_OTP_LENGTH) {
        return {
            ok: false,
            message: `Enter all ${VERIFICATION_OTP_LENGTH} digits of the code.`,
            spent: false,
        };
    }
    const name = input.name?.trim();
    const { error } = await settle<Answer>(() =>
        client.check({
            email: input.email.trim(),
            code,
            kind: input.kind ?? "sign-in",
            ...(name ? { name } : {}),
        }),
    );
    if (!error) return { ok: true };
    const known = CHECK_COPY[authErrorCode(error) ?? ""];
    if (known) return { ok: false, ...known };
    return {
        ok: false,
        message: authFailureCopy(error, "Couldn't check the code. Try again."),
        spent: false,
    };
}
