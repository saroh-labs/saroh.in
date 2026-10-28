"use client";

import { VERIFICATION_OTP_LENGTH } from "@saroh/auth/constants";
import { ChallengeWidget } from "@saroh/site-blocks/challenge";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { phoneLabel } from "@saroh/ui/lib/phone";
import { PhoneInput } from "@saroh/ui/phone-input";
import { useEffect, useState } from "react";

import { PHONE_SEND_WORDS } from "@/components/auth/phone-sign-in";
import { cannotSend, usePhoneSend } from "@/components/auth/use-phone-send";
import { authFailureCopy } from "@/lib/auth-error-copy";
import type { OtpSender } from "@/lib/otp-widget";
import { CAPTCHA_ELEMENT_ID } from "@/lib/otp-widget";
import { phoneCodeClient } from "@/lib/phone-code-client";
import type { PhoneOptions } from "@/lib/phone-sign-in";
import { addPhone, phoneOptions, removePhone } from "@/lib/phone-sign-in";
import {
    checkCode,
    codeDigits,
    resendLabel,
    resendWait,
    sendCode,
} from "@/lib/sign-in-code";

/** The words of the Phone card, in one place for its test. */
export const PHONE_WORDS = {
    title: "Phone",
    blurb: "A second way to sign in. Your email always works too.",
    none: "No phone added.",
    verified: "Verified",
    add: "Add phone",
    change: "Change",
    remove: "Remove",
    removeAsk: "Remove this phone? You can still sign in with your email.",
    keep: "Keep it",
    added: "Phone added. You can sign in with it now.",
    removed: "Phone removed.",
    removeFailed: "Couldn't remove the phone. Try again.",
    saveFailed: "Couldn't add the phone. Try again.",
} as const;

/** "Verified 27 Oct 2026". */
function verifiedOn(at: Date | string | null | undefined): string {
    if (!at) return PHONE_WORDS.verified;
    const day = new Date(at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
    return `${PHONE_WORDS.verified} ${day}`;
}

/**
 * {@link PhoneSection} once the API has said whether phones are offered
 * here. Not offered and no phone saved: no card at all.
 */
export function PhoneRow(props: {
    phoneE164: string | null;
    phoneVerifiedAt: Date | string | null;
}) {
    const [options, setOptions] = useState<PhoneOptions | null>(null);
    useEffect(() => {
        let live = true;
        void phoneOptions().then((o) => live && setOptions(o));
        return () => {
            live = false;
        };
    }, []);
    if (!options || (!options.available && !props.phoneE164)) return null;
    return (
        <PhoneSection
            {...props}
            canAdd={options.available}
            whatsapp={options.whatsapp}
            sms={options.sms}
            turnstileSiteKey={options.turnstileSiteKey}
        />
    );
}

/**
 * Account › Phone (DEC-196): add, change or remove the phone that signs
 * this account in. Adding and changing both need a fresh code to the new
 * number, which the API checks with the provider before saving; the
 * browser's word that it is verified is never enough. Removing needs no
 * code: the email still signs the person in.
 */
export function PhoneSection({
    phoneE164,
    phoneVerifiedAt,
    turnstileSiteKey,
    canAdd = true,
    whatsapp = true,
    sms = true,
}: {
    /** False while phones can't be verified here: Remove stays. */
    canAdd?: boolean;
    whatsapp?: boolean;
    sms?: boolean;
    phoneE164: string | null;
    phoneVerifiedAt: Date | string | null;
    turnstileSiteKey: string | null;
}) {
    const [current, setCurrent] = useState({
        phone: phoneE164,
        at: phoneVerifiedAt,
    });
    const [mode, setMode] = useState<"view" | "edit" | "remove">("view");
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function remove() {
        setBusy(true);
        setError(null);
        const answer = await removePhone();
        setBusy(false);
        if (answer.error) {
            setError(authFailureCopy(answer.error, PHONE_WORDS.removeFailed));
            return;
        }
        setCurrent({ phone: null, at: null });
        setMode("view");
        setNotice(PHONE_WORDS.removed);
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{PHONE_WORDS.title}</CardTitle>
                <CardDescription>{PHONE_WORDS.blurb}</CardDescription>
            </CardHeader>
            <CardContent className="grid max-w-sm gap-4">
                {notice && mode === "view" ? (
                    <p role="status" className="text-success text-sm">
                        {notice}
                    </p>
                ) : null}
                {error ? (
                    <p role="alert" className="text-destructive text-sm">
                        {error}
                    </p>
                ) : null}

                {mode === "edit" ? (
                    <PhoneChange
                        whatsapp={whatsapp}
                        sms={sms}
                        turnstileSiteKey={turnstileSiteKey}
                        onCancel={() => setMode("view")}
                        onSaved={(saved) => {
                            setCurrent({
                                phone: saved.phoneE164,
                                at: saved.phoneVerifiedAt,
                            });
                            setMode("view");
                            setNotice(PHONE_WORDS.added);
                        }}
                    />
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            {current.phone ? (
                                <>
                                    <span className="text-sm font-medium">
                                        {phoneLabel(current.phone)}
                                    </span>
                                    <Badge variant="success" size="sm">
                                        {verifiedOn(current.at)}
                                    </Badge>
                                </>
                            ) : (
                                <span className="text-muted-foreground text-sm">
                                    {PHONE_WORDS.none}
                                </span>
                            )}
                        </div>
                        {mode === "remove" ? (
                            <div className="grid gap-3">
                                <p className="text-sm">
                                    {PHONE_WORDS.removeAsk}
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="destructive"
                                        disabled={busy}
                                        onClick={() => void remove()}
                                    >
                                        {busy
                                            ? "Removing…"
                                            : PHONE_WORDS.remove}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => setMode("view")}
                                    >
                                        {PHONE_WORDS.keep}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                {canAdd ? (
                                    <Button
                                        variant={
                                            current.phone
                                                ? "outline"
                                                : "default"
                                        }
                                        className="w-fit"
                                        onClick={() => {
                                            setNotice(null);
                                            setError(null);
                                            setMode("edit");
                                        }}
                                    >
                                        {current.phone
                                            ? PHONE_WORDS.change
                                            : PHONE_WORDS.add}
                                    </Button>
                                ) : null}
                                {current.phone ? (
                                    <Button
                                        variant="ghost"
                                        className="w-fit"
                                        onClick={() => {
                                            setNotice(null);
                                            setError(null);
                                            setMode("remove");
                                        }}
                                    >
                                        {PHONE_WORDS.remove}
                                    </Button>
                                ) : null}
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * The new number, its code, then saved. Also the whole of accounts'
 * "Add your phone" step (`app/(auth)/add-phone`), which has no Cancel and
 * listens for `onUnavailable` so nobody is held while codes can't be sent.
 * The code comes on WhatsApp (owner, 28 Oct), or by SMS through the widget
 * after "Get the code by SMS instead".
 */
export function PhoneChange({
    whatsapp = true,
    sms = true,
    turnstileSiteKey,
    onCancel,
    onSaved,
    onUnavailable,
    label = "New phone",
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
}) {
    const flow = usePhoneSend(turnstileSiteKey, { purpose: "add", whatsapp });
    const onWhatsapp = flow.channel === "whatsapp";
    useEffect(() => {
        if (flow.unavailable) onUnavailable?.();
    }, [flow.unavailable, onUnavailable]);

    if (flow.stage === "code" && flow.sender) {
        return (
            <PhoneCode
                sender={flow.sender}
                phone={flow.phone}
                shownPhone={flow.shownPhone}
                whatsapp={flow.sender.channel === "whatsapp"}
                onCancel={onCancel}
                onSaved={onSaved}
                onUnavailable={onUnavailable}
                onNumberRefused={flow.reset}
            />
        );
    }

    const captcha = flow.stage === "captcha";
    return (
        <form
            className="grid gap-4"
            onSubmit={(e) => {
                e.preventDefault();
                void flow.submit();
            }}
            noValidate
        >
            {flow.error ? (
                <p role="alert" className="text-destructive text-sm">
                    {flow.error}
                </p>
            ) : null}
            <div className="grid gap-2">
                <Label htmlFor="new-phone">{label}</Label>
                <PhoneInput
                    id="new-phone"
                    autoComplete="tel"
                    defaultCountry="IN"
                    countryLabel="Country code"
                    value={flow.phone}
                    onValueChange={flow.setPhone}
                    disabled={flow.busy || captcha}
                    aria-invalid={flow.error && !captcha ? true : undefined}
                />
                <p className="text-muted-foreground text-xs">
                    We send a one-time code to it
                    {onWhatsapp ? " on WhatsApp" : " by SMS"}. It is saved once
                    you enter the code.
                </p>
            </div>
            {turnstileSiteKey && !captcha ? (
                <ChallengeWidget
                    key={flow.challengeKey}
                    siteKey={turnstileSiteKey}
                    onToken={flow.setTurnstileToken}
                />
            ) : null}
            <div id={CAPTCHA_ELEMENT_ID} />
            <div className="flex gap-2">
                <Button type="submit" disabled={flow.busy}>
                    {flow.busy
                        ? "Sending…"
                        : onWhatsapp && !captcha
                          ? PHONE_SEND_WORDS.whatsapp
                          : "Send code"}
                </Button>
                {onCancel ? (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={flow.busy}
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                ) : null}
            </div>
            {onWhatsapp && sms ? (
                <Button
                    type="button"
                    variant="link"
                    className="h-auto w-fit p-0"
                    disabled={flow.busy}
                    onClick={flow.toSms}
                >
                    {PHONE_SEND_WORDS.toSms}
                </Button>
            ) : null}
        </form>
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
    sender,
    phone,
    shownPhone,
    whatsapp,
    onCancel,
    onSaved,
    onUnavailable,
    onNumberRefused,
}: {
    sender: OtpSender;
    phone: string;
    shownPhone: string;
    /** The code came on WhatsApp, not by SMS. */
    whatsapp: boolean;
    onCancel?: () => void;
    onSaved: (saved: Saved) => void;
    onUnavailable?: () => void;
    /** The API refused the number itself (on another account): pick another. */
    onNumberRefused: (why: string) => void;
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
            {
                email: phone,
            },
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

    return (
        <form
            className="grid gap-4"
            onSubmit={(e) => {
                e.preventDefault();
                void check();
            }}
            noValidate
        >
            <p className="text-muted-foreground text-sm">
                We sent a {VERIFICATION_OTP_LENGTH}-digit code
                {whatsapp ? " on WhatsApp" : ""} to {shownPhone}.
            </p>
            {error ? (
                <p role="alert" className="text-destructive text-sm">
                    {error}
                </p>
            ) : null}
            <div className="grid gap-2">
                <Label htmlFor="phone-code">Code</Label>
                <Input
                    id="phone-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={VERIFICATION_OTP_LENGTH}
                    value={code}
                    onChange={(e) => setCode(codeDigits(e.target.value))}
                    disabled={checking}
                    aria-invalid={error ? true : undefined}
                    className="font-mono tracking-[0.4em]"
                />
            </div>
            <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={checking}>
                    {checking ? "Checking…" : "Save phone"}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    disabled={checking || wait > 0}
                    onClick={() => void resend()}
                >
                    {resendLabel(wait)}
                </Button>
                {onCancel ? (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={checking}
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                ) : null}
            </div>
        </form>
    );
}
