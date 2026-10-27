"use client";

import { ChallengeWidget } from "@saroh/site-blocks/challenge";

import { CodeStep } from "@/components/auth/code-step";
import {
    AuthAlt,
    AuthError,
    AuthHeading,
    AuthPhoneField,
    AuthSubmit,
} from "@/components/auth/field";
import { usePhoneSend } from "@/components/auth/use-phone-send";
import { CAPTCHA_ELEMENT_ID } from "@/lib/otp-widget";
import { phoneCodeClient } from "@/lib/phone-code-client";
import { signInWithPhone } from "@/lib/phone-sign-in";

/**
 * "Use phone instead" on Sign in (DEC-196). A phone is a second way in for
 * an account that added one; it never makes an account, so the page says
 * so before anything is sent. The number, the bot challenge, then the code
 * step every sign-in uses, in its phone words. The API checks the widget's
 * token with the provider before it makes the session.
 */
export function PhoneSignIn({
    turnstileSiteKey,
    next,
    doneLine,
    onDone,
    onUseEmail,
}: {
    turnstileSiteKey: string | null;
    next?: string;
    doneLine: string;
    onDone: () => void;
    onUseEmail: () => void;
}) {
    const flow = usePhoneSend(turnstileSiteKey);

    if (flow.stage === "code" && flow.sender) {
        const client = phoneCodeClient(flow.sender, (accessToken) =>
            signInWithPhone({ phone: flow.phone, accessToken }),
        );
        return (
            <CodeStep
                email={flow.shownPhone}
                next={next}
                doneLine={doneLine}
                resendAfterSeconds={30}
                onChangeEmail={() => flow.reset()}
                onDone={onDone}
                client={client}
            />
        );
    }

    const captcha = flow.stage === "captcha";
    return (
        <div>
            <AuthHeading
                title="Sign in with your phone"
                blurb="For an account that has a phone added. We send a one-time code to it."
            />
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    void flow.submit();
                }}
                noValidate
            >
                {flow.error ? <AuthError>{flow.error}</AuthError> : null}
                <AuthPhoneField
                    label="Phone"
                    note="No phone on your account yet? Sign in with your email, then add one in Account."
                    value={flow.phone}
                    onValueChange={flow.setPhone}
                    disabled={flow.busy || captcha}
                    invalid={Boolean(flow.error) && !captcha}
                />
                {turnstileSiteKey && !captcha ? (
                    <ChallengeWidget
                        key={flow.challengeKey}
                        siteKey={turnstileSiteKey}
                        onToken={flow.setTurnstileToken}
                    />
                ) : null}
                {/* The widget's own captcha draws here once it has loaded. */}
                <div id={CAPTCHA_ELEMENT_ID} className="mb-3.5" />
                <AuthSubmit disabled={flow.busy}>
                    {flow.busy
                        ? "Sending…"
                        : captcha
                          ? "Send code"
                          : "Send me a code"}
                </AuthSubmit>
            </form>
            <AuthAlt disabled={flow.busy} onClick={onUseEmail}>
                Use email instead
            </AuthAlt>
        </div>
    );
}
