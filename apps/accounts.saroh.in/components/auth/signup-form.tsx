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
 * Creating the account.
 *
 * `returnTo` is where sign-up should eventually land (#276), already vetted by
 * the server component above. `invitedEmail` is the address an invitation was
 * sent to: accepting refuses any other, so the field starts filled and says
 * why rather than letting someone make an account that cannot take the
 * invitation they just read.
 */
export function SignupForm({
    returnTo,
    invitedEmail,
}: {
    returnTo?: string | null;
    invitedEmail?: string;
}) {
    const router = useRouter();
    const { signUp } = authClient;
    const [name, setName] = useState("");
    const [email, setEmail] = useState(invitedEmail ?? "");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        const { error: err } = await signUp.email(
            { name, email, password },
            {
                onError: (ctx) => setError(ctx.error.message),
            },
        );
        setIsLoading(false);
        if (err) return;

        // Signup deliberately issues NO session — the auth server requires a
        // verified email first, and it has already mailed a code. Sending the
        // user to a session-gated page here is what used to bounce them to
        // /login with "Email not verified" and no way to act on it.
        // Carried through verification, so an invitee lands on the
        // invitation they clicked rather than in their own onboarding (#276).
        const destination = returnTo
            ? `&redirect=${encodeURIComponent(returnTo)}`
            : "";
        router.push(
            `/verify-email?email=${encodeURIComponent(email)}${destination}`,
        );
    }

    return (
        <div>
            <AuthHeading
                title="Make your account"
                blurb="Your details, not the business's — that comes in a moment."
            />
            <form onSubmit={handleSubmit} noValidate>
                {error ? <AuthError>{error}</AuthError> : null}
                <AuthField
                    label="Your name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    note="What your team sees when you invite them."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={isLoading}
                />
                <AuthField
                    label="Email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    note={
                        invitedEmail
                            ? "The invitation was sent to this address, so the account has to use it."
                            : "The verification code goes here, so use one you can open now."
                    }
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                />
                <AuthField
                    label="Password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    note="Eight characters or more."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={isLoading}
                />
                <AuthSubmit disabled={isLoading}>
                    {isLoading ? "Sending the code…" : "Send the code"}
                </AuthSubmit>
            </form>

            <SocialButtons
                callbackURL={returnTo ?? undefined}
                disabled={isLoading}
            />

            <AuthFooter>
                Already have an account?{" "}
                <Link
                    href={
                        returnTo
                            ? `/login?redirect=${encodeURIComponent(returnTo)}`
                            : "/login"
                    }
                    className="text-foreground underline-offset-4 transition-colors hover:underline"
                >
                    Log in
                </Link>
            </AuthFooter>
        </div>
    );
}
