import type { AuthFailure } from "./auth-error-copy";
import { authErrorCode, authFailureCopy, settle } from "./auth-error-copy";
import { codeDigits } from "./sign-in-code";

/**
 * A password is optional (owner, 10 Oct 2026): an account made with an
 * emailed code has none until its owner adds one on the account page.
 *
 * Adding the first one is proven by a code sent to the account's address,
 * not by the session alone: a browser someone left signed in must not be
 * able to give the account a password its owner never chose. It uses the
 * auth server's own reset-by-code, which also signs every device out, so
 * this device is signed back in with the new password straight away.
 */

/** Shorter than this and the server refuses it. */
export const PASSWORD_MIN = 8;

/** What is wrong with a new password before anything is sent, or null. */
export function passwordProblem(
    password: string,
    confirm: string,
): string | null {
    if (password.length < PASSWORD_MIN) {
        return authFailureCopy({ code: "PASSWORD_TOO_SHORT" });
    }
    if (password !== confirm) {
        return "Those two passwords don't match. Type them again.";
    }
    return null;
}

interface Answer {
    error: AuthFailure | null;
}

/** One linked way to sign in, as the auth server lists it. */
export interface LinkedAccount {
    providerId: string;
}

/**
 * Whether the account has a password: it does when a `credential` account
 * is linked. Null when the list could not be read, and the page then offers
 * the change form, which is right for every account made before 10 Oct.
 */
export function hasPassword(
    accounts: readonly LinkedAccount[] | null | undefined,
): boolean | null {
    if (!accounts) return null;
    return accounts.some((a) => a.providerId === "credential");
}

/** The auth client, as far as setting a first password uses it. */
export interface PasswordClient {
    askForCode: (email: string) => Promise<Answer>;
    setWithCode: (input: {
        email: string;
        code: string;
        password: string;
    }) => Promise<Answer>;
    signIn: (input: { email: string; password: string }) => Promise<Answer>;
}

export type FirstPasswordResult =
    | {
          ok: true;
          /**
           * False when the password is set but this device could not be
           * signed back in: the page says so and offers Sign in.
           */
          signedIn: boolean;
      }
    | { ok: false; message: string };

const CODE_COPY: Partial<Record<string, string>> = {
    INVALID_OTP: "That code isn't right. Check the email and try again.",
    OTP_EXPIRED: "That code has expired. Send a new one.",
    TOO_MANY_ATTEMPTS: "Too many wrong codes. Send a new one.",
};

/** Set the first password with the emailed code, then sign back in. */
export async function setFirstPassword(
    client: PasswordClient,
    input: { email: string; code: string; password: string },
): Promise<FirstPasswordResult> {
    const { error } = await settle<Answer>(() =>
        client.setWithCode({
            email: input.email,
            code: codeDigits(input.code),
            password: input.password,
        }),
    );
    if (error) {
        const known = CODE_COPY[authErrorCode(error) ?? ""];
        return {
            ok: false,
            message:
                known ??
                authFailureCopy(
                    error,
                    "Couldn't set your password. Try again.",
                ),
        };
    }
    // Setting it signed every device out, this one included.
    const back = await settle<Answer>(() =>
        client.signIn({ email: input.email, password: input.password }),
    );
    return { ok: true, signedIn: !back.error };
}
