"use client";

import { AuthHeading } from "@/components/auth/field";
import { OtpInput } from "@/components/auth/otp-input";
import { getOnboardingUrl } from "@/lib/app-urls";
import { authClient } from "@/lib/auth.client";
import {
    VERIFICATION_OTP_EXPIRY_SECONDS,
    VERIFICATION_OTP_LENGTH,
} from "@saroh/auth/constants";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/** The code's lifetime in minutes, read from the server's own constant. */
const CODE_MINUTES = Math.round(VERIFICATION_OTP_EXPIRY_SECONDS / 60);

/** Seconds before "Resend code" becomes clickable again. */
const RESEND_COOLDOWN_SECONDS = 60;

/* Success choreography. The order matters: the mark has to COMPLETE before the
   panel starts leaving, or the exit fades out the very thing it is meant to
   confirm and the user is left looking at an empty backdrop.

   0ms    ring scales in (420ms), tick draws from 260ms (380ms) → done at 640ms
   720ms  panel begins its exit (420ms)
   1140ms navigation fires, with the panel already gone */
const SUCCESS_EXIT_AT_MS = 720;
const SUCCESS_HOLD_MS = 1140;

/**
 * Better Auth's own messages here are developer-facing ("Invalid OTP", "OTP
 * expired"). Each of these states has a different next action, so say what it
 * is rather than restating the failure.
 */
const ERROR_COPY: Record<string, string> = {
    INVALID_OTP: "That code isn't right. Check it and try again.",
    OTP_EXPIRED: "That code has expired. Request a new one below.",
    TOO_MANY_ATTEMPTS:
        "Too many incorrect attempts. Request a new code below to keep going.",
};

function errorMessage(code: string | undefined, fallback: string | undefined) {
    return (
        (code && ERROR_COPY[code]) ??
        fallback ??
        "Something went wrong. Try again."
    );
}

/**
 * `returnTo` is where a freshly verified account should land (#222) — the page
 * they asked for before being bounced to sign in, already vetted by the server
 * component that renders this form. Null means there was nothing to return to,
 * and a new account belongs in onboarding rather than at a launcher full of
 * products that would bounce them straight back.
 */
export function VerifyEmailForm({
    returnTo = null,
}: {
    returnTo?: string | null;
} = {}) {
    const searchParams = useSearchParams();
    const email = searchParams.get("email") ?? "";

    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

    // Guards the auto-submit on the last digit: without it, a failed code that
    // the user edits would re-fire a request on every keystroke.
    const submittedCode = useRef<string | null>(null);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const verify = useCallback(
        async (otp: string) => {
            if (isVerifying || otp.length !== VERIFICATION_OTP_LENGTH) return;
            submittedCode.current = otp;
            setError(null);
            setNotice(null);
            setIsVerifying(true);

            const { error: err } = await authClient.emailOtp.verifyEmail({
                email,
                otp,
            });

            if (err) {
                setIsVerifying(false);
                setCode("");
                setError(errorMessage(err.code, err.message));
                return;
            }

            // `autoSignInAfterVerification` means the session cookie is already
            // set — the user goes straight into the product, never back to a
            // login form. Play the confirmation, then hand off: a hard
            // navigation to another origin freezes the tab for a beat, and
            // landing that freeze AFTER a completed animation reads as
            // progress instead of as a hang.
            setIsVerified(true);
            setTimeout(() => setIsLeaving(true), SUCCESS_EXIT_AT_MS);
            setTimeout(() => {
                window.location.href = returnTo ?? getOnboardingUrl();
            }, SUCCESS_HOLD_MS);
        },
        [email, isVerifying, returnTo],
    );

    async function resend() {
        if (cooldown > 0 || isResending) return;
        setError(null);
        setNotice(null);
        setIsResending(true);

        const { error: err } = await authClient.emailOtp.sendVerificationOtp({
            email,
            type: "email-verification",
        });

        setIsResending(false);
        setCooldown(RESEND_COOLDOWN_SECONDS);
        if (err) {
            setError(
                errorMessage(err.code, "Couldn't send a new code. Try again."),
            );
            return;
        }
        setCode("");
        submittedCode.current = null;
        setNotice(`We sent a new code to ${email}.`);
    }

    // Landing here without an email means a deep link or a lost query string;
    // there is nothing to verify against, so send them back to signup.
    if (!email) {
        return (
            <div>
                <AuthHeading
                    title="Nothing to verify yet"
                    blurb="We don't know which address to verify. Start the sign-up again and we'll send a fresh code."
                />
                <Button
                    asChild
                    className="sa-cta sa-rise h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                >
                    <Link href="/signup">Back to sign up</Link>
                </Button>
            </div>
        );
    }

    if (isVerified) {
        return (
            <div
                className={cn(
                    "flex flex-col items-center gap-4 py-14 text-center",
                    isLeaving && "sa-panel--leaving",
                )}
            >
                <SuccessMark />
                <div>
                    <p className="font-display text-xl font-semibold">
                        You&apos;re verified
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Taking you to your workspace…
                    </p>
                </div>
            </div>
        );
    }

    const complete = code.length === VERIFICATION_OTP_LENGTH;

    return (
        <div>
            {/*
             * The design's verify step, in the split (#U4). The account was
             * created at sign-up; what the code opens is the session, so the
             * line says that rather than the design's "nothing has been
             * created yet", which is not true of Better Auth.
             */}
            <AuthHeading
                title="Check your email"
                blurb="Not signed in yet. The session starts once this code is accepted."
            />
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    void verify(code);
                }}
                noValidate
            >
                {error ? (
                    <p
                        id="otp-error"
                        role="alert"
                        className="sa-alert border-destructive/40 bg-destructive-subtle text-destructive-subtle-foreground mb-3.5 rounded-[9px] border px-3 py-2 text-[12.5px]"
                    >
                        {error}
                    </p>
                ) : null}
                {notice ? (
                    <p
                        role="status"
                        className="sa-alert bg-muted text-muted-foreground mb-3.5 rounded-[9px] px-3 py-2 text-[12.5px]"
                    >
                        {notice}
                    </p>
                ) : null}

                <div className="sa-rise">
                    <OtpInput
                        value={code}
                        onChange={(next) => {
                            setCode(next);
                            if (next !== submittedCode.current) setError(null);
                        }}
                        onComplete={(next) => {
                            // Don't re-submit the exact code that just failed.
                            if (next !== submittedCode.current)
                                void verify(next);
                        }}
                        length={VERIFICATION_OTP_LENGTH}
                        disabled={isVerifying}
                        invalid={!!error}
                        describedBy={error ? "otp-error" : undefined}
                    />
                </div>

                {/* Where the code went and how long it lasts, with the way to
                    ask for another beside it rather than below the form. */}
                <div className="sa-rise mb-4 mt-2 flex items-baseline gap-2.5">
                    <p className="text-muted-foreground min-w-0 flex-1 text-pretty text-[11.5px] leading-[1.45]">
                        {VERIFICATION_OTP_LENGTH} digits, sent to{" "}
                        <span className="text-foreground">{email}</span>.{" "}
                        {CODE_MINUTES} minutes before it expires.
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={resend}
                        disabled={cooldown > 0 || isResending}
                        title={
                            cooldown > 0
                                ? `A new code can be sent in ${cooldown}s`
                                : undefined
                        }
                        className="h-7 shrink-0 rounded-[7px] px-2.5 text-[11.5px] font-semibold"
                    >
                        {isResending
                            ? "Sending…"
                            : cooldown > 0
                              ? `Resend (${cooldown}s)`
                              : "Resend"}
                    </Button>
                </div>

                <div className="sa-rise flex gap-2">
                    <Button
                        asChild
                        variant="outline"
                        className="h-10 rounded-[9px]"
                    >
                        <Link href="/signup" aria-label="Back to sign up">
                            Back
                        </Link>
                    </Button>
                    {/* The code submits itself on the sixth digit, so this is
                        the fallback — and when it cannot be pressed, it says
                        why rather than sitting inert. */}
                    <Button
                        type="submit"
                        className="sa-cta h-10 flex-1 rounded-[9px] text-[13.5px] font-semibold"
                        disabled={isVerifying || !complete}
                        title={
                            complete
                                ? undefined
                                : `All ${VERIFICATION_OTP_LENGTH} digits are needed`
                        }
                    >
                        {isVerifying ? "Verifying…" : "Verify"}
                    </Button>
                </div>
            </form>
        </div>
    );
}

/** Ring wipes in, then the tick draws. Two stages, because a single fade can't
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
