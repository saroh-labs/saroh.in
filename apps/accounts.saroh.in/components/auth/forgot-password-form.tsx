"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
    AuthError,
    AuthField,
    AuthFooter,
    AuthHeading,
    AuthSubmit,
} from "@/components/auth/field";
import { authClient } from "@/lib/auth.client";
import Link from "next/link";

/**
 * Asking for a reset link.
 *
 * The confirmation is its own route rather than a state this component swaps
 * into: someone who lands on it from the email a day later, or reloads it,
 * should see the same page, and a "check your email" that vanishes on refresh
 * is a page that lies about where you are.
 *
 * What this screen must never do is say whether the address has an account.
 * The success path is identical either way — it is reached whenever the
 * request itself succeeded, which it does for an unknown address too.
 */
export function ForgotPasswordForm() {
    const router = useRouter();
    const { requestPasswordReset } = authClient;
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        const redirectTo =
            typeof window !== "undefined"
                ? `${window.location.origin}/reset-password`
                : undefined;
        const { error: err } = await requestPasswordReset(
            { email, redirectTo },
            { onError: (ctx) => setError(ctx.error.message) },
        );
        setIsLoading(false);
        if (err) return;
        router.push(`/forgot-password/sent?email=${encodeURIComponent(email)}`);
    }

    return (
        <div>
            <AuthHeading
                title="Forgot your password"
                blurb="We will send a link to set a new one."
            />
            <form onSubmit={handleSubmit} noValidate>
                {error ? <AuthError>{error}</AuthError> : null}
                <AuthField
                    label="Email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                />
                <AuthSubmit disabled={isLoading}>
                    {isLoading ? "Sending…" : "Send reset link"}
                </AuthSubmit>
            </form>
            <AuthFooter>
                Remembered it?{" "}
                <Link
                    href="/login"
                    className="text-foreground underline-offset-4 transition-colors hover:underline"
                >
                    Log in
                </Link>
            </AuthFooter>
        </div>
    );
}
