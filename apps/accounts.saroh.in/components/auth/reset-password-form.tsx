"use client";

import { authClient } from "@/lib/auth.client";
import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import {
    AuthError,
    AuthField,
    AuthFooter,
    AuthHeading,
    AuthNote,
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

    /*
     * Expired FIRST. When a link is past its hour or already used, Better Auth
     * redirects here with `?error=INVALID_TOKEN` and NO token, so checking for
     * a missing token first answered every expired link with "this link is
     * missing a token" — and this state was unreachable.
     */
    if (errorParam === "INVALID_TOKEN") {
        return (
            <div>
                <AuthHeading
                    title="This link has expired"
                    blurb="Nothing has changed — your old password still works."
                />
                <AuthNote title="Expired or already used">
                    Links last an hour and work once. Ask for another and we
                    will send it to the same address.
                </AuthNote>
                <LinkActions />
            </div>
        );
    }

    if (!token) {
        return (
            <div>
                <AuthHeading
                    title="Nothing to reset yet"
                    blurb="Password resets start from the link in the email."
                />
                <AuthNote title="No link in this address">
                    Password resets start from the email. Ask for a link and
                    open it from there.
                </AuthNote>
                <LinkActions />
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
                title="Choose a new password"
                blurb="This signs you out everywhere else, which is the point."
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
                    note="Eight characters or more."
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={isLoading}
                />
                <AuthField
                    label="Type it again"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    // Why the field exists, not what it wants — "they must
                    // match" would only repeat the label.
                    note="So a typo cannot lock you out."
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

/**
 * The way out of a link that cannot be used: back to log in, or a new link.
 * Both states lead to the same two places, so they share one pair.
 */
function LinkActions() {
    return (
        <div className="sa-rise flex gap-2">
            <Button asChild variant="outline" className="h-10 rounded-[9px]">
                <Link href="/login">Back</Link>
            </Button>
            <Button
                asChild
                className="h-10 flex-1 rounded-[9px] text-[13.5px] font-semibold"
            >
                <Link href="/forgot-password">Send me a link</Link>
            </Button>
        </div>
    );
}
