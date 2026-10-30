"use client";

import { VERIFICATION_OTP_LENGTH } from "@saroh/auth/constants";
import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { PhoneInput } from "@saroh/ui/phone-input";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

import { PhoneChallenge } from "@/components/auth/phone-challenge";
import { PHONE_SEND_WORDS } from "@/components/auth/phone-sign-in";
import { cannotSend, usePhoneSend } from "@/components/auth/use-phone-send";
import type { OtpSender } from "@/lib/otp-widget";
import { phoneCodeClient } from "@/lib/phone-code-client";
import { addPhone } from "@/lib/phone-sign-in";
import {
    checkCode,
    codeDigits,
    resendLabel,
    resendWait,
    sendCode,
} from "@/lib/sign-in-code";

/** The words of the phone flow, in one place for its tests. */
export const PHONE_WORDS = {
    title: "Phone",
    blurb: "A second way to sign in. Your email always works too.",
    none: "Not added",
    verified: "Verified",
    add: "Add phone",
    change: "Change",
    remove: "Remove phone",
    removeTitle: "Remove your phone?",
    removeAsk:
        "You won't be able to sign in with it. You can still sign in with your email.",
    keep: "Keep phone",
    added: "Phone saved. You can sign in with it now.",
    removed: "Phone removed.",
    removeFailed: "Couldn't remove the phone. Try again.",
    saveFailed: "Couldn't add the phone. Try again.",
    label: "Indian mobile number",
    hint: "Indian mobile numbers only for now.",
    changeNumber: "Use a different number",
} as const;

/** "We'll send a code on WhatsApp. The number is saved when you enter it." */
function sendHint(onWhatsapp: boolean): string {
    return `${PHONE_WORDS.hint} We'll send a code ${
        onWhatsapp ? "on WhatsApp" : "by SMS"
    }. The number is saved when you enter it.`;
}

/**
 * A form, or (inside a sheet, which is a form of its own) a group whose
 * Enter sends: forms can't nest.
 */
function Frame({
    bare,
    onSend,
    children,
}: {
    bare: boolean;
    onSend: () => void;
    children: ReactNode;
}) {
    if (bare) {
        return (
            <div
                className="grid gap-4"
                onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                    if (
                        e.key === "Enter" &&
                        e.target instanceof HTMLInputElement
                    ) {
                        e.preventDefault();
                        onSend();
                    }
                }}
            >
                {children}
            </div>
        );
    }
    return (
        <form
            className="grid gap-4"
            onSubmit={(e) => {
                e.preventDefault();
                onSend();
            }}
            noValidate
        >
            {children}
        </form>
    );
}

/**
 * The new number, its code, then saved (DEC-196, DEC-199): Account ›
 * Phone's sheet, and the whole of accounts' "Add your phone" step
 * (`app/(auth)/add-phone`), which has no Cancel and listens for
 * `onUnavailable` so nobody is held while codes can't be sent.
 *
 * India only: a fixed +91, and the number is checked in the browser
 * before the Turnstile check or a code is spent. What is wrong is said
 * under the field. The code comes on WhatsApp (owner, 28 Oct), or by SMS
 * through the widget after "Get the code by SMS instead".
 */
export function PhoneChange({
    whatsapp = true,
    sms = true,
    turnstileSiteKey,
    onCancel,
    onSaved,
    onUnavailable,
    label = PHONE_WORDS.label,
    bare = false,
}: {
    /** Saroh can send on WhatsApp: the default way. */
    whatsapp?: boolean;
    /** The SMS widget is set up: the link under it. */
    sms?: boolean;
    turnstileSiteKey: string | null;
    /** Omitted, there is no Cancel. */
    onCancel?: () => void;
    onSaved: (saved: Saved) => void;
    /** Sending or checking failed because codes can't go out just now. */
    onUnavailable?: () => void;
    label?: string;
    /** Inside a sheet's own form: no form of its own. */
    bare?: boolean;
}) {
    const flow = usePhoneSend(turnstileSiteKey, { purpose: "add", whatsapp });
    const onWhatsapp = flow.channel === "whatsapp";
    useEffect(() => {
        if (flow.unavailable) onUnavailable?.();
    }, [flow.unavailable, onUnavailable]);

    if (flow.stage === "code" && flow.sender) {
        return (
            <PhoneCode
                bare={bare}
                sender={flow.sender}
                phone={flow.phone}
                shownPhone={flow.shownPhone}
                whatsapp={flow.sender.channel === "whatsapp"}
                sms={sms}
                onCancel={onCancel}
                onSaved={onSaved}
                onUnavailable={onUnavailable}
                onNumberRefused={flow.reset}
                onChangeNumber={() => flow.reset()}
                onSms={flow.toSms}
            />
        );
    }

    const captcha = flow.stage === "captcha";
    return (
        <Frame bare={bare} onSend={() => void flow.submit()}>
            <Field
                label={label}
                hint={sendHint(onWhatsapp)}
                error={captcha ? null : flow.error}
            >
                <PhoneInput
                    lockCountry="IN"
                    autoComplete="tel"
                    countryLabel="Country code"
                    value={flow.phone}
                    onValueChange={flow.setPhone}
                    disabled={flow.busy || captcha}
                />
            </Field>
            {captcha && flow.error ? (
                <p role="alert" className="text-destructive text-[12.5px]">
                    {flow.error}
                </p>
            ) : null}
            <PhoneChallenge flow={flow} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button
                    type={bare ? "button" : "submit"}
                    onClick={bare ? () => void flow.submit() : undefined}
                    busy={flow.busy}
                    busyLabel="Sending…"
                >
                    {onWhatsapp && !captcha
                        ? PHONE_SEND_WORDS.whatsapp
                        : "Send code"}
                </Button>
                {onWhatsapp && sms ? (
                    <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        disabled={flow.busy}
                        onClick={flow.toSms}
                    >
                        {PHONE_SEND_WORDS.toSms}
                    </Button>
                ) : null}
                {onCancel ? (
                    <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        disabled={flow.busy}
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                ) : null}
            </div>
        </Frame>
    );
}

export interface Saved {
    phoneE164: string;
    phoneVerifiedAt: string;
}

interface Box {
    saved: Saved | null;
    refused: string | null;
    /** The check couldn't be made: the provider or the API is down. */
    down: boolean;
}

/** The code for the new number: the API checks it, then saves the phone. */
function PhoneCode({
    bare,
    sender,
    phone,
    shownPhone,
    whatsapp,
    sms,
    onCancel,
    onSaved,
    onUnavailable,
    onNumberRefused,
    onChangeNumber,
    onSms,
}: {
    bare: boolean;
    sender: OtpSender;
    phone: string;
    shownPhone: string;
    /** The code came on WhatsApp, not by SMS. */
    whatsapp: boolean;
    sms: boolean;
    onCancel?: () => void;
    onSaved: (saved: Saved) => void;
    onUnavailable?: () => void;
    /** The API refused the number itself (on another account): pick another. */
    onNumberRefused: (why: string) => void;
    onChangeNumber: () => void;
    onSms: () => void;
}) {
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [resendAt, setResendAt] = useState(() => Date.now() + 30_000);
    const [now, setNow] = useState(() => Date.now());
    const wait = resendWait(resendAt, now);

    useEffect(() => {
        if (wait <= 0) return;
        const timer = setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(timer);
    }, [wait]);

    // Built per call: the API's answer is kept for after the check.
    function client(box: Box) {
        return phoneCodeClient(sender, async (proof) => {
            const answer = await addPhone({ phone, ...proof });
            box.saved = answer.data;
            box.refused = answer.error?.code ?? null;
            box.down = answer.error ? cannotSend(answer.error) : false;
            return answer;
        });
    }

    async function check() {
        setChecking(true);
        setError(null);
        const box: Box = { saved: null, refused: null, down: false };
        const result = await checkCode(client(box), { email: phone, code });
        setChecking(false);
        if (result.ok && box.saved) {
            onSaved(box.saved);
            return;
        }
        if (box.down) onUnavailable?.();
        if (!result.ok && box.refused === "PHONE_TAKEN") {
            onNumberRefused(result.message);
            return;
        }
        setCode("");
        setError(result.ok ? PHONE_WORDS.saveFailed : result.message);
    }

    async function resend() {
        const result = await sendCode(
            client({ saved: null, refused: null, down: false }),
            { email: phone },
        );
        const at = Date.now();
        setNow(at);
        if (result.ok) {
            setResendAt(at + result.resendAfterSeconds * 1_000);
            setError(null);
        } else {
            setError(result.message);
        }
    }

    const link = "h-auto p-0";
    return (
        <Frame bare={bare} onSend={() => void check()}>
            <p className="text-muted-foreground text-sm">
                We sent a {VERIFICATION_OTP_LENGTH}-digit code
                {whatsapp ? " on WhatsApp" : ""} to{" "}
                <span className="text-foreground whitespace-nowrap font-medium">
                    {shownPhone}
                </span>
                .
            </p>
            <Field label="Code" error={error}>
                <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={VERIFICATION_OTP_LENGTH}
                    value={code}
                    onChange={(e) => setCode(codeDigits(e.target.value))}
                    disabled={checking}
                    className="font-mono tracking-[0.4em]"
                />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type={bare ? "button" : "submit"}
                    onClick={bare ? () => void check() : undefined}
                    busy={checking}
                    busyLabel="Checking…"
                >
                    Save phone
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    disabled={checking || wait > 0}
                    onClick={() => void resend()}
                >
                    {resendLabel(wait)}
                </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button
                    type="button"
                    variant="link"
                    className={link}
                    disabled={checking}
                    onClick={onChangeNumber}
                >
                    {PHONE_WORDS.changeNumber}
                </Button>
                {whatsapp && sms ? (
                    <Button
                        type="button"
                        variant="link"
                        className={link}
                        disabled={checking}
                        onClick={onSms}
                    >
                        {PHONE_SEND_WORDS.toSms}
                    </Button>
                ) : null}
                {onCancel ? (
                    <Button
                        type="button"
                        variant="link"
                        className={link}
                        disabled={checking}
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                ) : null}
            </div>
        </Frame>
    );
}
