"use client";

import { OtpInput } from "@/components/auth/otp-input";
import { getOnboardingUrl } from "@/lib/app-urls";
import { authClient } from "@/lib/auth.client";
import { VERIFICATION_OTP_LENGTH } from "@saroh/auth/constants";
import { Button } from "@saroh/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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

const STAGGER_MS = 70;
const FIELD_BASE_MS = 260;

function delay(index: number): React.CSSProperties {
    return {
        "--sa-delay": `${FIELD_BASE_MS + index * STAGGER_MS}ms`,
    } as React.CSSProperties;
}

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
            <Card className="sa-panel mx-auto w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="font-display text-2xl">
                        Verification link incomplete
                    </CardTitle>
                    <CardDescription>
                        We don&apos;t know which address to verify. Start the
                        signup again and we&apos;ll send a fresh code.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        asChild
                        variant="highlight"
                        className="sa-cta w-full"
                    >
                        <Link href="/signup">Back to sign up</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card
            className={cn(
                "sa-panel mx-auto w-full max-w-sm",
                isLeaving && "sa-panel--leaving",
            )}
        >
            {isVerified ? (
                <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
                    <SuccessMark />
                    <div>
                        <p className="font-display text-xl font-semibold">
                            You&apos;re verified
                        </p>
                        <p className="text-muted-foreground mt-1 text-sm">
                            Taking you to your workspace…
                        </p>
                    </div>
                </CardContent>
            ) : (
                <>
                    <CardHeader>
                        <CardTitle
                            className="sa-rise font-display text-2xl"
                            style={delay(0)}
                        >
                            Check your email
                        </CardTitle>
                        <CardDescription className="sa-rise" style={delay(1)}>
                            We sent a {VERIFICATION_OTP_LENGTH}-digit code to{" "}
                            <span className="text-foreground font-medium">
                                {email}
                            </span>
                            . Enter it below to finish setting up your account.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                void verify(code);
                            }}
                            className="grid gap-4"
                        >
                            {error && (
                                <p
                                    id="otp-error"
                                    role="alert"
                                    className="sa-alert border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
                                >
                                    {error}
                                </p>
                            )}
                            {notice && (
                                <p
                                    role="status"
                                    className="sa-alert bg-muted text-muted-foreground rounded-md border px-3 py-2 text-sm"
                                >
                                    {notice}
                                </p>
                            )}

                            <div className="sa-rise" style={delay(2)}>
                                <OtpInput
                                    value={code}
                                    onChange={(next) => {
                                        setCode(next);
                                        if (next !== submittedCode.current)
                                            setError(null);
                                    }}
                                    onComplete={(next) => {
                                        // Don't re-submit the exact code that
                                        // just failed.
                                        if (next !== submittedCode.current)
                                            void verify(next);
                                    }}
                                    length={VERIFICATION_OTP_LENGTH}
                                    disabled={isVerifying}
                                    invalid={!!error}
                                    describedBy={
                                        error ? "otp-error" : undefined
                                    }
                                />
                            </div>

                            {/* Deliberately secondary. The code auto-submits on
                                the sixth digit, so the field is the action and
                                this button is the fallback — giving it the
                                filled black treatment would make the fallback
                                the loudest thing on the screen. */}
                            <Button
                                type="submit"
                                variant="secondary"
                                className="sa-press sa-rise w-full font-semibold"
                                style={delay(3)}
                                disabled={
                                    isVerifying ||
                                    code.length !== VERIFICATION_OTP_LENGTH
                                }
                            >
                                {isVerifying ? "Verifying…" : "Verify email"}
                            </Button>
                        </form>

                        <div
                            className="sa-rise text-muted-foreground mt-5 space-y-2 text-center text-sm"
                            style={delay(4)}
                        >
                            <p>
                                Didn&apos;t get it?{" "}
                                <button
                                    type="button"
                                    onClick={resend}
                                    disabled={cooldown > 0 || isResending}
                                    className="text-foreground underline-offset-4 transition-colors hover:underline disabled:no-underline disabled:opacity-60"
                                >
                                    {isResending
                                        ? "Sending…"
                                        : cooldown > 0
                                          ? `Resend code (${cooldown}s)`
                                          : "Resend code"}
                                </button>
                            </p>
                            <p>
                                Wrong address?{" "}
                                <Link
                                    href="/signup"
                                    className="text-foreground underline-offset-4 transition-colors hover:underline"
                                >
                                    Sign up again
                                </Link>
                            </p>
                        </div>
                    </CardContent>
                </>
            )}
        </Card>
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
