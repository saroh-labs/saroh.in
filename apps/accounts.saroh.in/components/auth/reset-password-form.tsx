"use client";

import { authClient } from "@/lib/auth.client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import {
    AuthError,
    AuthField,
    AuthFooter,
    AuthHeading,
    AuthSubmit,
} from "@/components/auth/field";

function ResetPasswordFormInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");
    const errorParam = searchParams.get("error");
    const { resetPassword } = authClient;
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    if (!token) {
        return (
            <div>
                <AuthHeading
                    title="Invalid link"
                    blurb="This reset link is missing a token. Request a new password reset from the login page."
                />
                <AuthFooter>
                    <Link
                        href="/forgot-password"
                        className="text-foreground underline-offset-4 transition-colors hover:underline"
                    >
                        Request a new reset link
                    </Link>
                </AuthFooter>
            </div>
        );
    }

    if (errorParam === "INVALID_TOKEN") {
        return (
            <div>
                <AuthHeading
                    title="Link expired"
                    blurb="This reset link is invalid or has already been used. Request a new one."
                />
                <AuthFooter>
                    <Link
                        href="/forgot-password"
                        className="text-foreground underline-offset-4 transition-colors hover:underline"
                    >
                        Request a new reset link
                    </Link>
                </AuthFooter>
            </div>
        );
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        if (!token) {
            setError("This reset link is missing a token.");
            return;
        }
        setIsLoading(true);
        const { error: err } = await resetPassword(
            { newPassword, token },
            {
                onError: (ctx) => setError(ctx.error.message),
            },
        );
        setIsLoading(false);
        if (err) return;
        // A route, not a flash: ending every other session is consequential
        // enough that the person it happened to should be able to sit with the
        // page rather than watch it vanish on a timer.
        router.push("/reset-password/done");
    }

    return (
        <div>
            <AuthHeading
                title="Set new password"
                blurb="Enter your new password below."
            />
            <form onSubmit={handleSubmit} noValidate>
                {error ? <AuthError>{error}</AuthError> : null}
                <AuthField
                    label="New password"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    // The rule, where it survives being typed against. As a
                    // placeholder it vanished on the first keystroke and came
                    // back only as an error after the form was submitted.
                    note="At least 8 characters."
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={isLoading}
                />
                <AuthField
                    label="Confirm password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    // No note. "They must match" is what the label already
                    // says, and a second line here would only teach people
                    // that the line under a field is not worth reading.
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={isLoading}
                />
                {/*
                 * The consequence, BEFORE the button that causes it.
                 *
                 * `revokeSessionsOnPasswordReset` is on, so saving here signs
                 * this person out of every other device. The panel beside the
                 * form says so too, but the panel is gone below 760px and a
                 * consequence this size cannot live only in the half that
                 * disappears.
                 *
                 * Not a field note: it belongs to the ACT, not to either
                 * password, and hanging it under one of the two would make it
                 * read as a rule about that box.
                 */}
                <p className="sa-rise text-muted-foreground mt-1 text-pretty text-[11.5px] leading-[1.45]">
                    Saving a new password signs you out everywhere else — every
                    other browser and device, including any you no longer have.
                </p>
                <AuthSubmit disabled={isLoading}>
                    {isLoading ? "Saving…" : "Save new password"}
                </AuthSubmit>
            </form>
            <AuthFooter>
                <Link
                    href="/login"
                    className="text-foreground underline-offset-4 transition-colors hover:underline"
                >
                    Back to log in
                </Link>
            </AuthFooter>
        </div>
    );
}

export function ResetPasswordForm() {
    return (
        <Suspense
            fallback={
                <div>
                    <p className="text-muted-foreground text-sm">Loading…</p>
                </div>
            }
        >
            <ResetPasswordFormInner />
        </Suspense>
    );
}
