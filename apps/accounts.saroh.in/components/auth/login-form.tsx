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
import { getAppUrl } from "@/lib/app-urls";
import { authFailureCopy, settle } from "@/lib/auth-error-copy";
import { isJoining, withCarry } from "@/lib/joining";
import type { SocialProvider } from "@/lib/sign-in-options";

/**
 * `returnTo` is where this sign-in should land (#222): the page the visitor
 * asked for before they were bounced here, already checked against the
 * trusted origins by the server component that renders this form. It is a
 * destination, never a claim: this component does not decide whether it is
 * safe, because it cannot. With none, signing in lands on Saroh itself
 * (`getAppUrl`), whose front door sorts out setup, Home or which business.
 *
 * `invitedEmail` fills the address in when the visitor arrived from an
 * invitation: that invitation can only be taken by the account it was sent to,
 * so the field starts on the right one rather than on whichever account they
 * happen to remember. The "You already have a Saroh account" email and the
 * verify page's "Sign in" fill it the same way, without fixing it.
 */
export function LoginForm({
    returnTo,
    invitedEmail,
    providers = [],
}: {
    returnTo?: string | null;
    invitedEmail?: string;
    /** The social providers with keys set (`lib/sign-in-options.ts`). */
    providers?: SocialProvider[];
} = {}) {
    const router = useRouter();
    const { signIn } = authClient;
    const destination = returnTo ?? getAppUrl();
    const [email, setEmail] = useState(invitedEmail ?? "");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    // Joining someone's business through their invitation (UX-029).
    const joining = isJoining(returnTo);
    // The invitation's address, which the accept insists on: fixed.
    const emailLocked = joining && !!invitedEmail;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        const { error: err } = await settle(() =>
            signIn.email({ email, password, callbackURL: destination }),
        );
        setIsLoading(false);

        if (err?.code === "EMAIL_NOT_VERIFIED") {
            // Not a dead end: the server has just mailed a fresh code
            // (emailVerification.sendOnSignIn), so forward to the screen that
            // can consume it rather than showing "Email not verified" with
            // nowhere to go. The destination rides along: someone who has to
            // verify first should still land where they were going.
            router.push(withCarry("/verify-email", returnTo, email));
            return;
        }
        if (err) {
            setError(authFailureCopy(err));
            return;
        }
        // An absolute destination is another origin (app.saroh.in), which the
        // client router cannot reach. A path is this app's own.
        if (destination.startsWith("/")) {
            router.push(destination);
        } else {
            window.location.href = destination;
        }
    }

    return (
        <div>
            {/* The heading names the act, as the design does on every page.
                The panel beside it says what signing in reaches. */}
            <AuthHeading
                title={joining ? "Sign in to join" : "Sign in"}
                blurb={
                    joining
                        ? "Then you join the business that invited you."
                        : "Welcome back."
                }
            />
            <form onSubmit={handleSubmit} noValidate>
                {error ? <AuthError>{error}</AuthError> : null}
                <AuthField
                    label="Email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    note={
                        emailLocked
                            ? "The invitation was sent to this address, so it has to be this account."
                            : "The address you signed up with."
                    }
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={emailLocked}
                    aria-readonly={emailLocked || undefined}
                    required
                    disabled={isLoading}
                />
                <AuthField
                    label="Password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    side={{ href: "/forgot-password", label: "Forgot it?" }}
                    // True: a wrong email and a wrong password get the same
                    // answer, so the form cannot be used to check who has an
                    // account here.
                    note="We never say which of the two was wrong."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                />
                <AuthSubmit disabled={isLoading}>
                    {isLoading ? "Signing in…" : "Sign in"}
                </AuthSubmit>
            </form>

            <SocialButtons
                providers={providers}
                callbackURL={destination}
                disabled={isLoading}
            />

            <AuthFooter>
                No account yet?{" "}
                <Link
                    href={withCarry(
                        "/signup",
                        returnTo,
                        emailLocked ? invitedEmail : undefined,
                    )}
                    className="text-foreground decoration-border-strong hover:decoration-foreground active:text-muted-foreground underline underline-offset-4 transition-colors"
                >
                    Create one
                </Link>
            </AuthFooter>
        </div>
    );
}
