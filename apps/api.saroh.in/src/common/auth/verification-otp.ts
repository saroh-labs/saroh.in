import { Logger } from "@nestjs/common";

import { sendVerificationOtpEmail } from "../email";
import { signInHeldForEmail } from "./sign-in-holds";

const logger = new Logger("SignInHold");

/**
 * Better Auth's `sendVerificationOTP` (`auth.ts`): every code the API's auth
 * sends, the console's "Send a sign-in code" among them, goes out here.
 *
 * Kept out of `auth.ts` so a spec can run it without Better Auth, which
 * the CommonJS test runner cannot load.
 *
 * An address whose change by Saroh staff is still held (admin console U9,
 * `sign-in-holds.ts`) gets no code: the screen answers as always, and
 * nothing arrives until the hold ends or a second staff member confirms.
 */
export async function deliverVerificationOtp(
    {
        to,
        otp,
        type,
    }: {
        to: string;
        otp: string;
        type:
            | "sign-in"
            | "email-verification"
            | "forget-password"
            | "change-email";
    },
    expiresInSeconds: number,
): Promise<void> {
    if (await signInHeldForEmail(to)) {
        logger.log(`No ${type} code sent: the address is held.`);
        return;
    }
    await sendVerificationOtpEmail(to, otp, type, expiresInSeconds);
}
