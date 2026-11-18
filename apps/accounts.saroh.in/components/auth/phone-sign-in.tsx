"use client";

import Link from "next/link";
import { useState } from "react";

import { CodeStep } from "@/components/auth/code-step";
import {
    AuthAlt,
    AuthError,
    AuthFooter,
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

/**
 * A code only reaches a number already on an account (owner, 18 Nov): a
 * new person signs up with email and adds the phone in Account after. The
 * code step never says whether the number had one.
 */
export const PHONE_SIGN_IN_WORDS = {
    whatsapp:
        "The code only reaches a number already added to a Saroh account. We send it on WhatsApp.",
    // The SMS widget sends whatever the number: say only who it is for.
    sms: "For a number already added to a Saroh account. We send it a one-time code by SMS.",
    note: "No phone on your account yet? Sign in with your email, then add one in Account.",
    newHere: "New to Saroh?",
    signUp: "Sign up with email",
} as const;

/**
 * "If +91 98450 12345 is on a Saroh account, a 6-digit code is on its way
 * on WhatsApp." SMS keeps "We sent": the widget sends whatever the number.
 */
export function whatsappSignInLead(phone: string): string {
    return `If ${phone} is on a Saroh account, a 6-digit code is on its way on WhatsApp. It lasts 10 minutes.`;
}

export const PHONE_SEND_WORDS = {
    whatsapp: "Send code on WhatsApp",
    sms: "Send me a code",
    toSms: "Get the code by SMS instead",
} as const;

/**
 * "Use phone instead" on Sign in (DEC-196). A phone is a second way in for
 * an account that added one; it never makes an account, so the page says
 * so before anything is sent, and offers sign-up by email beside it. The number, the bot challenge, then the code
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
    signUpHref = "/signup",
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
    /** Where "Sign up with email" goes, carrying the return-to. */
    signUpHref?: string;
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
                lead={
                    onWhatsapp ? whatsappSignInLead(flow.shownPhone) : undefined
                }
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
                        ? PHONE_SIGN_IN_WORDS.whatsapp
                        : PHONE_SIGN_IN_WORDS.sms
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
                    note={PHONE_SIGN_IN_WORDS.note}
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
            <AuthFooter>
                {PHONE_SIGN_IN_WORDS.newHere}{" "}
                <Link
                    href={signUpHref}
                    className="text-foreground decoration-border-strong hover:decoration-foreground active:text-muted-foreground underline underline-offset-4 transition-colors"
                >
                    {PHONE_SIGN_IN_WORDS.signUp}
                </Link>
            </AuthFooter>
        </div>
    );
}
