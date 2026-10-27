"use client";

import { phoneLabel, phoneNumberProblem } from "@saroh/ui/lib/phone";
import { useState } from "react";

import type { AuthFailure } from "@/lib/auth-error-copy";
import { authFailureCopy, NETWORK_ERROR } from "@/lib/auth-error-copy";
import type { OtpSender } from "@/lib/otp-widget";
import { otpSender } from "@/lib/otp-widget";
import { startPhone } from "@/lib/phone-sign-in";

export type PhoneSendStage = "number" | "captcha" | "code";

/** Couldn't open the widget or send through it. */
export const SEND_FAILED = "Couldn't send the code. Try again.";
/**
 * A refusal that says codes can't go out at all just now (the provider or
 * the API is down), not that this number or this person did something wrong.
 */
export function cannotSend(failure: AuthFailure): boolean {
    return (
        failure.code === "UNAVAILABLE" ||
        failure.code === NETWORK_ERROR ||
        (failure.status ?? 0) >= 500
    );
}

export const FINISH_CHECK =
    "Finish the check above, then press Send code again.";

/**
 * Getting a code to a phone (DEC-196), for sign-in and for Profile alike:
 * the number, the bot challenge, the API's start (its limits), then the
 * widget, whose own captcha may need solving before it sends. Under the
 * fake provider the widget is a stand-in and nothing is sent.
 *
 * The screen renders `CAPTCHA_ELEMENT_ID`'s element while this is in the
 * number or captcha stage, so the widget has somewhere to draw.
 */
export function usePhoneSend(turnstileSiteKey: string | null) {
    const [phone, setPhone] = useState("");
    const [stage, setStage] = useState<PhoneSendStage>("number");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    // Codes can't go out just now: a required step lets the person go on.
    const [unavailable, setUnavailable] = useState(false);
    const [sender, setSender] = useState<OtpSender | null>(null);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    // A Turnstile token is good once: a new key draws a fresh challenge.
    const [challengeKey, setChallengeKey] = useState(0);

    async function sendThrough(next: OtpSender) {
        try {
            await next.send();
            setStage("code");
        } catch {
            setError(next.captcha ? FINISH_CHECK : SEND_FAILED);
            if (!next.captcha) setUnavailable(true);
            setStage("captcha");
        }
    }

    async function submit() {
        setError(null);
        if (stage === "captcha" && sender) {
            setBusy(true);
            await sendThrough(sender);
            setBusy(false);
            return;
        }
        const problem = phoneNumberProblem(phone);
        if (problem) {
            setError(problem);
            return;
        }
        if (turnstileSiteKey && !turnstileToken) {
            setError("Confirm you're not a robot first.");
            return;
        }
        setBusy(true);
        const started = await startPhone({ phone, turnstileToken });
        setTurnstileToken(null);
        setChallengeKey((k) => k + 1);
        if (started.error) {
            setBusy(false);
            setError(authFailureCopy(started.error, SEND_FAILED));
            if (cannotSend(started.error)) setUnavailable(true);
            return;
        }
        let next: OtpSender;
        try {
            next = await otpSender(started.data, phone);
        } catch {
            setBusy(false);
            setError(SEND_FAILED);
            setUnavailable(true);
            return;
        }
        setSender(next);
        if (next.captcha) {
            // The widget's own captcha is drawn now; Send code sends.
            setStage("captcha");
        } else {
            await sendThrough(next);
        }
        setBusy(false);
    }

    /** Back to the number, with the reason when the number was refused. */
    function reset(why: string | null = null) {
        setStage("number");
        setSender(null);
        setError(why);
    }

    return {
        phone,
        setPhone: (value: string) => {
            setPhone(value);
            setError(null);
        },
        /** "+91 98450 12345", for the code step's lead. */
        shownPhone: phoneLabel(phone),
        stage,
        error,
        busy,
        unavailable,
        sender,
        turnstileSiteKey,
        challengeKey,
        setTurnstileToken,
        submit,
        reset,
    };
}
