import type { OtpSender } from "./otp-widget";
import type { PhoneAnswer, PhoneProof } from "./phone-sign-in";
import type { CodeClient } from "./sign-in-code";

/** A code the widget would not confirm: in the words of the email step. */
export const WRONG_PHONE_CODE =
    "That code isn't right. Check the message and try again.";
export const RESEND_FAILED = "Couldn't send a new code. Try again.";

/**
 * The code step's two calls for a phone (DEC-196), so the same `CodeStep`
 * takes a phone's code. WhatsApp: resend asks the API to send again, and
 * the typed code goes to the API (`confirm`) as it is. SMS: resend asks
 * the widget again (its own limits and captcha apply), and a check gets the
 * widget's token for the code, which the API checks with the provider.
 * Either way the API checks before it makes a session or saves the phone;
 * nothing here decides the code is right.
 */
export function phoneCodeClient(
    sender: OtpSender,
    confirm: (proof: PhoneProof) => Promise<PhoneAnswer<unknown>>,
): CodeClient {
    return {
        channel: sender.channel === "whatsapp" ? "whatsapp" : "phone",
        async send() {
            try {
                await sender.retry();
                return { error: null };
            } catch {
                return { error: { words: RESEND_FAILED } };
            }
        },
        async check({ code }) {
            let proof: PhoneProof;
            try {
                proof = await sender.verify(code);
            } catch {
                return { error: { words: WRONG_PHONE_CODE } };
            }
            const answer = await confirm(proof);
            return answer.error ? { error: answer.error } : { error: null };
        },
    };
}
