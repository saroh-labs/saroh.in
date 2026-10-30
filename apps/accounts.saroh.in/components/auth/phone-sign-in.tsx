"use client";

import { useState } from "react";

import { CodeStep } from "@/components/auth/code-step";
import {
    AuthAlt,
    AuthError,
    AuthHeading,
    AuthPhoneField,
    AuthSubmit,
} from "@/components/auth/field";
import { PhoneChallenge } from "@/components/auth/phone-challenge";
import { usePhoneSend } from "@/components/auth/use-phone-send";
import { phoneCodeClient } from "@/lib/phone-code-client";
import { signInWithPhone } from "@/lib/phone-sign-in";

/** The words that change with the channel, in one place for the test. */
/** The API's code for a phone not proved in 12 months (DEC-198). */
export const PHONE_STALE = "PHONE_STALE";

export const STALE_WORDS = {
    title: "Sign in with your email this time",
    body: "This phone hasn't been used to sign in for a year. Sign in with your email once and the phone works again.",
    action: "Sign in with email",
} as const;

export const PHONE_SEND_WORDS = {
    whatsapp: "Send code on WhatsApp",
    sms: "Send me a code",
    toSms: "Get the code by SMS instead",
} as const;

/**
 * "Use phone instead" on Sign in (DEC-196). A phone is a second way in for
 * an account that added one; it never makes an account, so the page says
 * so before anything is sent. The number, the bot challenge, then the code
 * step every sign-in uses, in its phone words. The code comes on WhatsApp
 * from Saroh (owner, 28 Oct); "Get the code by SMS instead" opens the SMS
 * widget. The API checks the code, or the widget's token with the
 * provider, before it makes the session.
 */
export function PhoneSignIn({
    whatsapp = true,
    sms = true,
    turnstileSiteKey,
    next,
    doneLine,
    onDone,
    onUseEmail,
}: {
    /** Saroh can send on WhatsApp: the default way. */
    whatsapp?: boolean;
    /** The SMS widget is set up: the link under it. */
    sms?: boolean;
    turnstileSiteKey: string | null;
    next?: string;
    doneLine: string;
    onDone: () => void;
    onUseEmail: () => void;
}) {
    const flow = usePhoneSend(turnstileSiteKey, {
        purpose: "sign-in",
        whatsapp,
    });
    const onWhatsapp = flow.channel === "whatsapp";
    // The phone is right but stale (DEC-198): only email signs in now.
    const [stale, setStale] = useState(false);

    if (stale) {
        return (
            <div>
                <AuthHeading
                    title={STALE_WORDS.title}
                    blurb={STALE_WORDS.body}
                />
                <AuthSubmit type="button" onClick={onUseEmail}>
                    {STALE_WORDS.action}
                </AuthSubmit>
            </div>
        );
    }

    if (flow.stage === "code" && flow.sender) {
        const client = phoneCodeClient(flow.sender, async (proof) => {
            const answer = await signInWithPhone({
                phone: flow.phone,
                ...proof,
            });
            if (answer.error?.code === PHONE_STALE) setStale(true);
            return answer;
        });
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
                blurb={
                    onWhatsapp
                        ? "For an account that has a phone added. We send a one-time code to it on WhatsApp."
                        : "For an account that has a phone added. We send a one-time code to it by SMS."
                }
            />
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    void flow.submit();
                }}
                noValidate
            >
                {flow.error && flow.stage === "captcha" ? (
                    <AuthError>{flow.error}</AuthError>
                ) : null}
                <AuthPhoneField
                    label="Indian mobile number"
                    note="No phone on your account yet? Sign in with your email, then add one in Account."
                    value={flow.phone}
                    onValueChange={flow.setPhone}
                    disabled={flow.busy || captcha}
                    error={captcha ? null : flow.error}
                />
                <PhoneChallenge flow={flow} className="mb-3.5" />
                <AuthSubmit disabled={flow.busy}>
                    {flow.busy
                        ? "Sending…"
                        : captcha
                          ? "Send code"
                          : onWhatsapp
                            ? PHONE_SEND_WORDS.whatsapp
                            : PHONE_SEND_WORDS.sms}
                </AuthSubmit>
            </form>
            {onWhatsapp && sms ? (
                <AuthAlt disabled={flow.busy} onClick={flow.toSms}>
                    {PHONE_SEND_WORDS.toSms}
                </AuthAlt>
            ) : null}
            <AuthAlt
                disabled={flow.busy}
                className={onWhatsapp && sms ? "mt-0" : undefined}
                onClick={onUseEmail}
            >
                Use email instead
            </AuthAlt>
        </div>
    );
}
