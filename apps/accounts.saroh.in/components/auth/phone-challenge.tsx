"use client";

import { ChallengeWidget } from "@saroh/site-blocks/challenge";

import { CAPTCHA_ELEMENT_ID } from "@/lib/otp-widget";

import type { usePhoneSend } from "./use-phone-send";

/**
 * The bot check before a phone code is sent (Turnstile), and the place the
 * SMS widget draws its own captcha: one for sign-in, Add your phone and
 * Account › Phone.
 */
export function PhoneChallenge({
    flow,
    className,
}: {
    flow: ReturnType<typeof usePhoneSend>;
    className?: string;
}) {
    return (
        <>
            {flow.turnstileSiteKey && flow.stage !== "captcha" ? (
                <ChallengeWidget
                    key={flow.challengeKey}
                    siteKey={flow.turnstileSiteKey}
                    onToken={flow.setTurnstileToken}
                />
            ) : null}
            <div id={CAPTCHA_ELEMENT_ID} className={className} />
        </>
    );
}
