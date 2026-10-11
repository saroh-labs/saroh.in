"use client";

import { VERIFICATION_OTP_LENGTH } from "@saroh/auth/constants";
import { cn } from "@saroh/ui/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

import {
    AuthAlt,
    AuthError,
    AuthField,
    AuthHeading,
    AuthSubmit,
} from "@/components/auth/field";
import { codeClient } from "@/lib/code-client";
import type { CodeClient, CodeKind } from "@/lib/sign-in-code";
import {
    checkCode,
    CODE_WORDS,
    codeDigits,
    codeLead,
    resendLabel,
    resendWait,
    sendCode,
} from "@/lib/sign-in-code";

/* Success choreography. The order matters: the mark has to COMPLETE before the
   panel starts leaving, or the exit fades out the very thing it is meant to
   confirm and the person is left looking at an empty backdrop.

   0ms    ring fades in, then the tick draws
   720ms  panel begins its exit
   1140ms navigation fires, with the panel already gone */
const SUCCESS_EXIT_AT_MS = 720;
const SUCCESS_HOLD_MS = 1140;

/**
 * The code step: one field, the same on sign-up, sign-in and for a password
 * account confirming its address (UX audit, 10 Oct). It was six boxes with
 * "Resend (42s)" and "Back" here, and one field with "Resend code in 24s"
 * and "Change email" on a merchant's own site. Now a merchant and their
 * customers meet the same step, in the same words
 * (`packages/site-blocks/src/account/sign-in-sheet.tsx`).
 *
 * - The sixth digit sends the code to be checked. The button stays, for a
 *   code a password manager fills and for a press of Enter.
 * - `autocomplete="one-time-code"`, numeric keys, 16px on a touch screen.
 * - It says where the code went and how long it lasts, both from what the
 *   server is set to.
 * - "Resend code in 24s" counts down from the wait the send came back with.
 *   A code that ran out or took too many wrong tries offers "Send a new
 *   code" at once.
 * - "Change email" goes back with the address still in the field.
 *
 * It never says whether the address had an account.
 */
export function CodeStep({
    email,
    kind = "sign-in",
    name,
    next,
    doneLine,
    resendAfterSeconds,
    onChangeEmail,
    onDone,
    client = codeClient,
}: {
    email: string;
    kind?: CodeKind;
    /** Kept only when the code makes a new account (someone joining). */
    name?: string;
    /** What happens after the code: "Next, you set up your business." */
    next?: string;
    /** Under "You're signed in", while the page hands off. */
    doneLine: string;
    /** The wait before Resend, as the send that led here returned it. */
    resendAfterSeconds: number;
    onChangeEmail: () => void;
    /** Signed in. Called once the confirmation has played. */
    onDone: () => void;
    client?: CodeClient;
}) {
    const field = useRef<HTMLInputElement>(null);
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [spent, setSpent] = useState(false);
    const [checking, setChecking] = useState(false);
    const [sending, setSending] = useState(false);
    const [done, setDone] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [resendAt, setResendAt] = useState<number | null>(
        () => Date.now() + resendAfterSeconds * 1_000,
    );
    const [now, setNow] = useState(() => Date.now());
    // A check under way from the moment it is asked: the sixth digit and a
    // press of the button in the same breath are one check.
    const busy = useRef(false);
    // The code that just failed is not sent again by itself.
    const failed = useRef<string | null>(null);

    const wait = resendWait(resendAt, now);

    // This step exists to take six digits, so it starts in the field.
    useEffect(() => {
        field.current?.focus();
    }, []);

    // The countdown ticks only while there is one.
    useEffect(() => {
        if (wait <= 0) return;
        const timer = setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(timer);
    }, [wait]);

    const check = useCallback(
        async (typed: string) => {
            if (busy.current) return;
            busy.current = true;
            setChecking(true);
            setError(null);
            setNotice(null);
            const result = await checkCode(client, {
                email,
                code: typed,
                kind,
                name,
            });
            busy.current = false;
            if (result.ok) {
                // The session is set. Play the confirmation, then hand off:
                // a move to another origin freezes the tab for a beat, and
                // landing that freeze after a finished mark reads as progress.
                setDone(true);
                setTimeout(() => setLeaving(true), SUCCESS_EXIT_AT_MS);
                setTimeout(onDone, SUCCESS_HOLD_MS);
                return;
            }
            setChecking(false);
            failed.current = codeDigits(typed);
            setCode("");
            setError(result.message);
            setSpent(result.spent);
            field.current?.focus();
        },
        [client, email, kind, name, onDone],
    );

    function onCode(value: string) {
        const digits = codeDigits(value);
        const complete =
            digits.length === VERIFICATION_OTP_LENGTH &&
            code.length < VERIFICATION_OTP_LENGTH;
        setCode(digits);
        if (digits !== failed.current) setError(null);
        if (complete && digits !== failed.current) void check(digits);
    }

    async function resend() {
        if (sending || (!spent && wait > 0)) return;
        setSending(true);
        setError(null);
        setNotice(null);
        const result = await sendCode(client, { email, kind });
        setSending(false);
        const at = Date.now();
        setNow(at);
        if (result.ok) {
            setResendAt(at + result.resendAfterSeconds * 1_000);
            setCode("");
            setSpent(false);
            failed.current = null;
            setNotice(`We sent a new code to ${email}.`);
            field.current?.focus();
            return;
        }
        setError(result.message);
        if (result.resendAfterSeconds !== null) {
            setResendAt(at + result.resendAfterSeconds * 1_000);
        }
    }

    if (done) {
        return (
            <div
                role="status"
                className={cn(
                    "flex flex-col items-center gap-4 py-14 text-center",
                    leaving && "sa-panel--leaving",
                )}
            >
                <SuccessMark />
                <div>
                    <p className="font-display text-xl font-semibold">
                        {CODE_WORDS.signedIn}
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {doneLine}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <AuthHeading
                title={CODE_WORDS.title}
                blurb={
                    <>
                        {codeLead(email)}
                        {next ? ` ${next}` : null}
                    </>
                }
            />
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    void check(code);
                }}
                noValidate
            >
                {error ? <AuthError>{error}</AuthError> : null}
                {notice ? (
                    <p
                        role="status"
                        className="sa-alert bg-muted text-muted-foreground mb-3.5 rounded-[9px] px-3 py-2 text-[12.5px]"
                    >
                        {notice}
                    </p>
                ) : null}
                <AuthField
                    ref={field}
                    label={CODE_WORDS.label}
                    name="code"
                    // `text` with numeric keys: `number` draws spinners and
                    // takes "e", "+" and "-".
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={CODE_WORDS.placeholder}
                    maxLength={VERIFICATION_OTP_LENGTH}
                    value={code}
                    onChange={(e) => onCode(e.target.value)}
                    disabled={checking}
                    aria-invalid={error ? true : undefined}
                    note={CODE_WORDS.spam}
                    className="coarse:text-[17px] font-mono text-[17px] tracking-[0.4em]"
                />
                <AuthSubmit disabled={checking}>
                    {checking ? CODE_WORDS.checking : CODE_WORDS.submit}
                </AuthSubmit>
            </form>
            {spent ? (
                <AuthAlt onClick={resend} disabled={sending || checking}>
                    {sending ? "Sending…" : CODE_WORDS.sendNew}
                </AuthAlt>
            ) : (
                <AuthAlt
                    onClick={resend}
                    disabled={sending || checking || wait > 0}
                >
                    {sending ? "Sending…" : resendLabel(wait)}
                </AuthAlt>
            )}
            <AuthAlt
                onClick={onChangeEmail}
                disabled={checking}
                className="mt-0"
            >
                {CODE_WORDS.changeEmail}
            </AuthAlt>
        </div>
    );
}

/** Ring fades in, then the tick draws. Two stages, because a single fade can't
 *  convey "this completed" the way a stroke that travels can. */
function SuccessMark() {
    return (
        <svg
            viewBox="0 0 48 48"
            // `--success`, not the CTA token. Status colours are the one place
            // this system stays chromatic on purpose: hue is carrying the
            // meaning, and a monochrome "you succeeded" is indistinguishable
            // from a monochrome "something failed".
            className="text-success size-14"
            fill="none"
            aria-hidden="true"
        >
            <circle
                className="sa-check-ring"
                cx="24"
                cy="24"
                r="21"
                stroke="currentColor"
                strokeOpacity="0.35"
                strokeWidth="2"
            />
            <path
                className="sa-check-path"
                d="M15 24.5 21.5 31 33 18"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
