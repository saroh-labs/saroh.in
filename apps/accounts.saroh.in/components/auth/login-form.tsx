"use client";

import { authClient } from "@/lib/auth.client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
    AuthError,
    AuthField,
    AuthFooter,
    AuthHeading,
    AuthSubmit,
} from "@/components/auth/field";
import { SocialButtons } from "@/components/auth/social-buttons";

/**
 * `returnTo` is where this sign-in should land (#222) — the page the visitor
 * asked for before they were bounced here, already checked against the
 * trusted origins by the server component that renders this form. It is a
 * destination, never a claim: this component does not decide whether it is
 * safe, because it cannot.
 */
export function LoginForm({
    returnTo = "/apps",
}: {
    returnTo?: string;
} = {}) {
    const router = useRouter();
    const { signIn } = authClient;
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        const { error: err } = await signIn.email(
            { email, password, callbackURL: returnTo },
            {
                onError: (ctx) => {
                    // Not a dead end: the server has just mailed a fresh code
                    // (emailVerification.sendOnSignIn), so forward to the
                    // screen that can consume it rather than showing "Email not
                    // verified" with nowhere to go.
                    if (ctx.error.code === "EMAIL_NOT_VERIFIED") return;
                    setError(ctx.error.message);
                },
            },
        );
        setIsLoading(false);

        if (err?.code === "EMAIL_NOT_VERIFIED") {
            // Carry the destination through the detour: someone who has to
            // verify first should still land where they were going, not at
            // the launcher because they took an extra step.
            router.push(
                `/verify-email?email=${encodeURIComponent(email)}` +
                    `&redirect=${encodeURIComponent(returnTo)}`,
            );
            return;
        }
        if (err) return;
        // An absolute destination is another origin (app.saroh.in), which the
        // client router cannot reach; a path is this app's own.
        if (returnTo.startsWith("/")) {
            router.push(returnTo);
        } else {
            window.location.href = returnTo;
        }
    }

    return (
        <div>
            {/* "Welcome back" belongs to the panel beside this form; the
                heading names the act, as the design does on all five pages. */}
            <AuthHeading title="Log in" blurb="Continue to your workspace." />
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
                <AuthField
                    label="Password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    side={{ href: "/forgot-password", label: "Forgot it?" }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                />
                <AuthSubmit disabled={isLoading}>
                    {isLoading ? "Signing in…" : "Log in"}
                </AuthSubmit>
            </form>

            <SocialButtons callbackURL={returnTo} disabled={isLoading} />

            <AuthFooter>
                No account yet?{" "}
                <Link
                    href={`/signup?redirect=${encodeURIComponent(returnTo)}`}
                    className="text-foreground underline-offset-4 transition-colors hover:underline"
                >
                    Create one
                </Link>
            </AuthFooter>
        </div>
    );
}
