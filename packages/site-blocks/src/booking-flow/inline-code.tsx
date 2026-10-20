"use client";

import type { Ref } from "react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";

import type {
    CodeRequestResult,
    SignedInCustomer,
    SignInApi,
    SignInOptions,
    VerifyResult,
} from "../account/api";
import { codeDigits, looksLikeEmail } from "../account/api";
import { ChallengeWidget } from "../account/challenge";
import {
    clearSignInDraft,
    readSignInDraft,
    writeSignInDraft,
} from "../account/sign-in-draft";
import type { Problem } from "../account/sign-in-sheet";
import {
    ProblemText,
    resendDelayMs,
    resendWait,
} from "../account/sign-in-sheet";
import { cn } from "../lib/utils";
import { useTestRelease } from "../test-release/context";
import { lookField, lookFieldBad, lookLink } from "./look-styles";

/**
 * The code, asked inside Your details (DEC-172, R9, KD9, plan U10): every
 * email gets one, new or returning, with the same words, and the page never
 * says whether the address has booked before.
 *
 * - The code is sent when the email field is left with a complete address
 *   (or when the step's button is pressed), never on each key. The code
 *   field then opens under the email, with "Change" beside the address.
 * - One field, `autocomplete="one-time-code"`; paste fills it, and it is
 *   checked at the sixth digit. A wrong code says so in words and the
 *   field's edge — no shake.
 * - "Send a new code" waits out the API's own limit, with the wait in
 *   words. "Change" clears the code and the wait.
 * - The email and the step are kept for the visit (`sign-in-draft.ts`,
 *   shared with the sign-in sheet), so a page loaded again on the way back
 *   from the email app still has them. Never the code.
 *
 * Nothing here books: signing in only says who they are (`onSignedIn`).
 */

export interface InlineCodeHandle {
    /** The step's button was pressed: send the code, or ask for it. */
    press: () => void;
}

/** The words before a code is sent: the same for every address. */
export const CODE_LEAD =
    "We'll email a 6-digit code here to confirm it's you. No password.";

/** "We sent a 6-digit code to asha@example.com to confirm it's you." */
export function codeSentText(email: string): string {
    return `We sent a 6-digit code to ${email} to confirm it's you.`;
}

export const WRONG_CODE =
    "That code didn't match. Check the latest email or send a new one.";

/** "0:24": the wait before another code, as a clock. */
export function waitClock(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function InlineCode({
    ids,
    options,
    api,
    onSignedIn,
    onSent,
    handle,
}: {
    /** The flow's `useId()`, so each field's id is its own. */
    ids: string;
    options: SignInOptions;
    api: SignInApi;
    onSignedIn: (customer: SignedInCustomer) => void;
    /**
     * Whether a code is on its way (the code field is open): the account's
     * sign-in page (U12) hides its "Send me a code" then.
     */
    onSent?: (sent: boolean) => void;
    handle?: Ref<InlineCodeHandle>;
}) {
    const testRelease = useTestRelease() !== null;
    const emailField = useRef<HTMLInputElement>(null);
    const codeField = useRef<HTMLInputElement>(null);
    const [email, setEmail] = useState("");
    // The address the code on its way went to; null before one is sent.
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [sentAt, setSentAt] = useState<number | null>(null);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState<"sending" | "checking" | null>(null);
    const checking = useRef(false);
    const [problem, setProblem] = useState<Problem | null>(null);
    const [resendAt, setResendAt] = useState<number | null>(null);
    const [now, setNow] = useState(0);
    const [token, setToken] = useState<string | null>(null);
    const [askedKey, setAskedKey] = useState<string | null>(null);
    // The email field was left once with a whole address: a challenge
    // solved after that sends the code by itself.
    const left = useRef(false);
    const siteKey =
        askedKey ??
        (options.challenge.required ? options.challenge.siteKey : null);

    // Where an earlier load of the page had got to: read after the first
    // draw, so the server's blank and the browser's draft never differ.
    useEffect(() => {
        const kept = readSignInDraft();
        // Restored once after hydration, never during it.
        /* eslint-disable react-hooks/set-state-in-effect */
        if (!kept.email) return;
        setEmail(kept.email);
        if (kept.step === "code" && kept.sentAt !== null) {
            setSentTo(kept.email.trim());
            setSentAt(kept.sentAt);
            setResendAt(kept.sentAt + resendDelayMs(undefined));
            setNow(Date.now());
        }
        /* eslint-enable react-hooks/set-state-in-effect */
    }, []);

    useEffect(() => {
        onSent?.(sentTo !== null);
        // Told when it changes, not when the caller's function does.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sentTo]);

    useEffect(() => {
        writeSignInDraft({
            email,
            step: sentTo !== null ? "code" : "email",
            sentAt: sentTo !== null ? sentAt : null,
        });
    }, [email, sentTo, sentAt]);

    // The wait before another code ticks only while there is one.
    const waiting = resendWait(resendAt, now);
    useEffect(() => {
        if (sentTo === null || resendAt === null) return;
        if (resendWait(resendAt, Date.now()) === 0) return;
        const timer = setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(timer);
    }, [sentTo, resendAt, now]);

    const ready = looksLikeEmail(email) && (!siteKey || token !== null);

    async function send(force = false) {
        const address = email.trim();
        if (busy || !ready) return;
        if (!force && sentTo === address) return;
        if (testRelease) {
            setProblem({ ok: false, reason: "test-release" });
            return;
        }
        setBusy("sending");
        setProblem(null);
        const result = await api
            .requestCode(address, token ?? undefined)
            .catch((): CodeRequestResult => ({ ok: false, reason: "error" }));
        setBusy(null);
        // A challenge token is good for one request.
        setToken(null);
        if (result.ok) {
            const at = Date.now();
            setSentTo(address);
            setSentAt(at);
            setResendAt(at + resendDelayMs(result.resendAfterSeconds));
            setNow(at);
            setCode("");
            // The code field opens under the email; focus goes to it only
            // when they asked for it with the button (`press`).
            return;
        }
        if (result.reason === "challenge") setAskedKey(result.siteKey);
        setProblem(result);
    }

    // A challenge solved after the field was left sends the code then.
    useEffect(() => {
        if (token !== null && left.current && sentTo === null) void send();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    async function verify(typed: string) {
        const digits = codeDigits(typed);
        const address = sentTo;
        if (!address || checking.current || digits.length !== 6) return;
        if (testRelease) {
            setProblem({ ok: false, reason: "test-release" });
            return;
        }
        checking.current = true;
        setBusy("checking");
        setProblem(null);
        const result = await api
            .verifyCode(address, digits)
            .catch((): VerifyResult => ({ ok: false, reason: "error" }));
        checking.current = false;
        setBusy(null);
        if (result.ok) {
            clearSignInDraft();
            onSignedIn(result.customer);
            return;
        }
        setProblem(result);
    }

    function onCode(value: string) {
        const digits = codeDigits(value);
        const complete = digits.length === 6 && codeDigits(code).length < 6;
        setCode(digits);
        if (problem?.reason === "invalid") setProblem(null);
        if (complete) void verify(digits);
    }

    function change() {
        setSentTo(null);
        setSentAt(null);
        setResendAt(null);
        setCode("");
        setProblem(null);
        emailField.current?.focus();
    }

    function resend() {
        if (waiting > 0 || busy) return;
        // A challenge token is good for one request: solve it again first.
        if (siteKey) {
            change();
            return;
        }
        void send(true);
    }

    useImperativeHandle(handle, () => ({
        press: () => {
            if (sentTo !== null) {
                codeField.current?.focus();
                return;
            }
            if (!looksLikeEmail(email)) {
                setProblem({ ok: false, reason: "email" });
                emailField.current?.focus();
                return;
            }
            void send().then(() => codeField.current?.focus());
        },
    }));

    const sent = sentTo !== null;
    const wrong = problem?.reason === "invalid";
    const expired = problem?.reason === "expired";
    const leadId = `${ids}-code-lead`;
    const codeHint = `${ids}-code-hint`;

    return (
        <div data-inline-code="" className="mt-4">
            <label
                htmlFor={`${ids}-email`}
                className="text-site-fg block text-[13.5px] font-semibold"
            >
                Email
            </label>
            <div className="mt-1.5 flex items-center gap-3">
                <input
                    ref={emailField}
                    id={`${ids}-email`}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    readOnly={sent}
                    aria-describedby={leadId}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        if (problem?.reason === "email") setProblem(null);
                    }}
                    onBlur={() => {
                        if (!looksLikeEmail(email)) return;
                        left.current = true;
                        void send();
                    }}
                    className={cn(
                        lookField,
                        "min-w-0 flex-1",
                        sent && "text-site-body",
                    )}
                />
                {sent ? (
                    <button
                        type="button"
                        onClick={change}
                        aria-label={`Change email, ${sentTo}`}
                        className={cn(lookLink, "shrink-0")}
                    >
                        Change
                    </button>
                ) : null}
            </div>
            <p
                id={leadId}
                aria-live="polite"
                className="text-site-body mt-2 text-[13.5px] leading-normal [overflow-wrap:anywhere]"
            >
                {busy === "sending"
                    ? "Sending the code…"
                    : sent
                      ? codeSentText(sentTo)
                      : CODE_LEAD}
            </p>

            {!sent && siteKey ? (
                <ChallengeWidget siteKey={siteKey} onToken={setToken} />
            ) : null}

            {sent ? (
                <div
                    data-site-fade=""
                    className="border-site-border mt-3 border-t pt-3"
                >
                    <label
                        htmlFor={`${ids}-code`}
                        className="text-site-fg block text-[13.5px] font-semibold"
                    >
                        Code
                    </label>
                    <input
                        ref={codeField}
                        id={`${ids}-code`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={code}
                        onChange={(e) => onCode(e.target.value)}
                        aria-invalid={wrong ? true : undefined}
                        aria-describedby={codeHint}
                        className={cn(
                            lookField,
                            "mt-1.5 w-full tracking-[0.4em]",
                            wrong && lookFieldBad,
                        )}
                    />
                    <p
                        id={codeHint}
                        className={cn(
                            "mt-2 text-[13px] leading-normal",
                            wrong
                                ? "text-site-fg font-semibold"
                                : "text-site-muted",
                        )}
                        role={wrong ? "alert" : undefined}
                    >
                        {wrong
                            ? WRONG_CODE
                            : busy === "checking"
                              ? "Checking…"
                              : "It checks itself at the sixth digit."}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4">
                        <button
                            type="button"
                            onClick={resend}
                            aria-disabled={waiting > 0 || busy !== null}
                            className={cn(
                                lookLink,
                                (waiting > 0 || busy !== null) &&
                                    "text-site-muted cursor-default no-underline",
                            )}
                        >
                            Send a new code
                        </button>
                        {waiting > 0 ? (
                            <span className="text-site-muted text-[13px]">
                                You can send another in {waitClock(waiting)}
                            </span>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {problem && !wrong ? (
                <ProblemText
                    problem={
                        expired ? { ok: false, reason: "expired" } : problem
                    }
                    businessName={options.businessName}
                    phone={options.phone}
                />
            ) : null}
        </div>
    );
}
