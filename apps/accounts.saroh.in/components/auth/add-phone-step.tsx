"use client";

import { useCallback, useState } from "react";

import { PhoneChange } from "@/components/account/phone-section";
import { AuthAlt, AuthHeading, AuthNote } from "@/components/auth/field";
import { authClient } from "@/lib/auth.client";

/** The step's words, in one place for its test. */
export const ADD_PHONE_WORDS = {
    title: "Add your phone",
    blurb: "Saroh asks every account for a phone. We send a one-time code to check it is yours.",
    label: "Phone",
    downTitle: "Codes aren't going out just now",
    downBody:
        "That's on our side. Carry on with your email, and we'll ask for your phone next time you sign in.",
    goOn: "Continue for now",
    signOut: "Sign out",
    signingOut: "Signing out…",
} as const;

/**
 * "Add your phone" (DEC-196), after sign-in or sign-up while a phone is
 * required. The same number-and-code flow as Account › Phone
 * (`PhoneChange`), with no Cancel: the way out is Sign out. When a send or
 * a check fails because codes can't go out at all, "Continue for now" opens
 * so nobody is held at a step that can't finish.
 */
export function AddPhoneStep({
    destination,
    turnstileSiteKey,
    whatsapp = true,
    sms = true,
}: {
    /** Saroh can send on WhatsApp: the default way. */
    whatsapp?: boolean;
    /** The SMS widget is set up: the link under it. */
    sms?: boolean;
    /** Where the sign-in was going, already vetted on the server. */
    destination: string;
    turnstileSiteKey: string | null;
}) {
    const [down, setDown] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const onUnavailable = useCallback(() => setDown(true), []);

    function goOn() {
        window.location.href = destination;
    }

    return (
        <div>
            <AuthHeading
                title={ADD_PHONE_WORDS.title}
                blurb={ADD_PHONE_WORDS.blurb}
            />
            {down ? (
                <AuthNote title={ADD_PHONE_WORDS.downTitle}>
                    {ADD_PHONE_WORDS.downBody}
                </AuthNote>
            ) : null}
            <PhoneChange
                whatsapp={whatsapp}
                sms={sms}
                label={ADD_PHONE_WORDS.label}
                turnstileSiteKey={turnstileSiteKey}
                onSaved={goOn}
                onUnavailable={onUnavailable}
            />
            {down ? (
                <AuthAlt onClick={goOn}>{ADD_PHONE_WORDS.goOn}</AuthAlt>
            ) : null}
            <AuthAlt
                disabled={leaving}
                onClick={async () => {
                    setLeaving(true);
                    await authClient.signOut();
                    window.location.href = "/login";
                }}
            >
                {leaving ? ADD_PHONE_WORDS.signingOut : ADD_PHONE_WORDS.signOut}
            </AuthAlt>
        </div>
    );
}
