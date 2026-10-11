"use client";

import { authClient } from "@/lib/auth.client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CodeStep } from "@/components/auth/code-step";
import {
    AuthAlt,
    AuthError,
    AuthField,
    AuthFooter,
    AuthHeading,
    AuthSubmit,
} from "@/components/auth/field";
import { codeNext, doneLine } from "@/components/auth/panel-copy";
import { SocialButtons } from "@/components/auth/social-buttons";
import { getAppUrl } from "@/lib/app-urls";
import { authFailureCopy, settle } from "@/lib/auth-error-copy";
import { codeClient } from "@/lib/code-client";
import { isJoining, withCarry } from "@/lib/joining";
import type { CodeClient } from "@/lib/sign-in-code";
import { sendCode } from "@/lib/sign-in-code";
import type { SocialProvider } from "@/lib/sign-in-options";

/** The two ways to sign in with an address. A code is the main one. */
export type SignInWay = "code" | "password";

/**
 * Signing in. "Email me a code" is the main way (owner, 10 Oct 2026): it
 * needs nothing remembered, and it is how a merchant's own customers sign in
 * on their site. "Use a password instead" is one press away for an account
 * that has one, and works exactly as it did. Google stays.
 *
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
 * happen to remember.
 *
 * `way` opens the form on one of the two (`/login?with=password`), for a link
 * that knows: the page after a password reset says "sign in with the new
 * one".
 */
export function LoginForm({
    returnTo,
    invitedEmail,
    providers = [],
    way: startWay = "code",
    client = codeClient,
}: {
    returnTo?: string | null;
    invitedEmail?: string;
    /** The social providers with keys set (`lib/sign-in-options.ts`). */
    providers?: SocialProvider[];
    way?: SignInWay;
    client?: CodeClient;
} = {}) {
    const router = useRouter();
    const { signIn } = authClient;
    const destination = returnTo ?? getAppUrl();
    const [way, setWay] = useState<SignInWay>(startWay);
    const [email, setEmail] = useState(invitedEmail ?? "");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    // The code step, once a code has gone: the wait before Resend, and
    // which kind of code it is.
    const [sent, setSent] = useState<{
        wait: number;
        kind: "sign-in" | "email-verification";
    } | null>(null);
    // Joining someone's business through their invitation (UX-029).
    const joining = isJoining(returnTo);
    // The invitation's address, which the accept insists on: fixed.
    const emailLocked = joining && !!invitedEmail;

    function leave() {
        // An absolute destination is another origin (app.saroh.in), which the
        // client router cannot reach. A path is this app's own.
        if (destination.startsWith("/")) {
            router.push(destination);
        } else {
            window.location.href = destination;
        }
    }

    async function askForCode() {
        setIsLoading(true);
        const result = await sendCode(client, { email });
        setIsLoading(false);
        if (!result.ok) {
            setError(result.message);
            return;
        }
        setSent({ wait: result.resendAfterSeconds, kind: "sign-in" });
    }

    async function withPassword() {
        setIsLoading(true);
        const { error: err } = await settle(() =>
            signIn.email({ email, password, callbackURL: destination }),
        );
        setIsLoading(false);

        if (err?.code === "EMAIL_NOT_VERIFIED") {
            // Not a dead end: the server has just mailed a code
            // (emailVerification.sendOnSignIn), so the code step takes it
            // here rather than showing "Email not verified" with nowhere to
            // go. The right code confirms the address and signs in.
            setSent({ wait: 0, kind: "email-verification" });
            return;
        }
        if (err) {
            setError(authFailureCopy(err));
            return;
        }
        leave();
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        void (way === "code" ? askForCode() : withPassword());
    }

    if (sent) {
        return (
            <CodeStep
                email={email.trim()}
                kind={sent.kind}
                next={codeNext(returnTo, "sign-in")}
                doneLine={doneLine(returnTo, "sign-in")}
                resendAfterSeconds={sent.wait}
                onChangeEmail={() => setSent(null)}
                onDone={() => {
                    window.location.href = destination;
                }}
                client={client}
            />
        );
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
                        : way === "code"
                          ? "No password needed. We email you a one-time code."
                          : "Welcome back."
                }
            />
            <form onSubmit={handleSubmit} noValidate>
                {error ? <AuthError>{error}</AuthError> : null}
                <AuthField
                    label="Email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    note={
                        emailLocked
                            ? "The invitation was sent to this address, so it has to be this account."
                            : way === "code"
                              ? "New here? The same code creates your account."
                              : "The address you signed up with."
                    }
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={emailLocked}
                    aria-readonly={emailLocked || undefined}
                    required
                    disabled={isLoading}
                />
                {way === "password" ? (
                    <AuthField
                        label="Password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        side={{ href: "/forgot-password", label: "Forgot it?" }}
                        // True: a wrong email and a wrong password get the
                        // same answer, so the form cannot be used to check
                        // who has an account here.
                        note="We never say which of the two was wrong."
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isLoading}
                    />
                ) : null}
                <AuthSubmit disabled={isLoading}>
                    {way === "code"
                        ? isLoading
                            ? "Sending…"
                            : "Email me a code"
                        : isLoading
                          ? "Signing in…"
                          : "Sign in"}
                </AuthSubmit>
            </form>
            <AuthAlt
                disabled={isLoading}
                onClick={() => {
                    setError(null);
                    setWay(way === "code" ? "password" : "code");
                }}
            >
                {way === "code"
                    ? "Use a password instead"
                    : "Email me a code instead"}
            </AuthAlt>

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
