import type { OtpSender } from "./otp-widget";
import type { PhoneAnswer } from "./phone-sign-in";
import type { CodeClient } from "./sign-in-code";

/** A code the widget would not confirm: in the words of the email step. */
export const WRONG_PHONE_CODE =
    "That code isn't right. Check the message and try again.";
export const RESEND_FAILED = "Couldn't send a new code. Try again.";

/**
 * The code step's two calls for a phone (DEC-196), so the same `CodeStep`
 * takes a texted code. Resend asks the widget again (its own limits and
 * captcha apply); a check gets the widget's token for the code, then hands
 * it to the API (`confirm`), which checks it with the provider before it
 * makes a session or saves the phone. Nothing here decides the code is
 * right.
 */
export function phoneCodeClient(
    sender: OtpSender,
    confirm: (accessToken: string) => Promise<PhoneAnswer<unknown>>,
): CodeClient {
    return {
        channel: "phone",
        async send() {
            try {
                await sender.retry();
                return { error: null };
            } catch {
                return { error: { words: RESEND_FAILED } };
            }
        },
        async check({ code }) {
            let token: string;
            try {
                token = await sender.verify(code);
            } catch {
                return { error: { words: WRONG_PHONE_CODE } };
            }
            const answer = await confirm(token);
            return answer.error ? { error: answer.error } : { error: null };
        },
    };
}
