"use client";

import Link from "next/link";
import { useState } from "react";

import { CodeStep } from "@/components/auth/code-step";
import {
    AuthError,
    AuthField,
    AuthFooter,
    AuthHeading,
    AuthSubmit,
} from "@/components/auth/field";
import { codeNext, doneLine, PROMISE } from "@/components/auth/panel-copy";
import { SocialButtons } from "@/components/auth/social-buttons";
import { afterSignUp, getAppUrl, getOnboardingUrl } from "@/lib/app-urls";
import { codeClient } from "@/lib/code-client";
import { isJoining, withCarry } from "@/lib/joining";
import type { CodeClient } from "@/lib/sign-in-code";
import { sendCode } from "@/lib/sign-in-code";
import type { SocialProvider } from "@/lib/sign-in-options";

/**
 * Making the account: an email address, then the code sent to it (owner,
 * 10 Oct 2026). No password and no name. A password is optional and is set
 * later from the account page, and the name is asked in setup, beside the
 * business's.
 *
 * Someone joining a business through an invitation never sees setup, so
 * this is where they are asked their name: it is what the team sees.
 *
 * An address that already has an account gets the same screen and the same
 * email, and the code signs it in. Nothing here says which it was.
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
    providers = [],
    client = codeClient,
}: {
    returnTo?: string | null;
    invitedEmail?: string;
    /** The social providers with keys set (`lib/sign-in-options.ts`). */
    providers?: SocialProvider[];
    client?: CodeClient;
}) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState(invitedEmail ?? "");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    // The wait before Resend that the send came back with: set, the code
    // step is showing.
    const [sent, setSent] = useState<number | null>(null);
    // Joining someone's business through their invitation (UX-029).
    const joining = isJoining(returnTo);
    // The invitation's address, which the accept insists on: fixed.
    const emailLocked = joining && !!invitedEmail;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (joining && !name.trim()) {
            setError("Enter your name. It is what the team sees.");
            return;
        }
        setIsLoading(true);
        const result = await sendCode(client, { email });
        setIsLoading(false);
        if (!result.ok) {
            setError(result.message);
            return;
        }
        setSent(result.resendAfterSeconds);
    }

    if (sent !== null) {
        return (
            <CodeStep
                email={email.trim()}
                name={joining ? name : undefined}
                next={codeNext(returnTo, "sign-up")}
                doneLine={doneLine(returnTo, "sign-up")}
                resendAfterSeconds={sent}
                onChangeEmail={() => setSent(null)}
                onDone={() => {
                    // A new account has no business, and the app's front
                    // door sends it to setup. So does it sort out someone
                    // who already had an account and signed up again: they
                    // land in their business, not in setup for another.
                    // `afterSignUp` routes it through saroh.in's /welcome
                    // when that hand-off is on (DEC-127): the code typed
                    // here is the address confirmed, which is the sign-up
                    // that page counts. This page loads no advertising tag.
                    window.location.href = afterSignUp(returnTo ?? getAppUrl());
                }}
                client={client}
            />
        );
    }

    return (
        <div>
            <AuthHeading
                title={
                    joining ? "Make your account to join" : "Make your account"
                }
                promise={joining ? undefined : PROMISE}
                blurb={
                    joining
                        ? "No password. We email you a code, and then you join the business that invited you."
                        : "No password. We email you a code, and then you name your business."
                }
            />
            <form onSubmit={handleSubmit} noValidate>
                {error ? <AuthError>{error}</AuthError> : null}
                {joining ? (
                    <AuthField
                        label="Your name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        note="What the team sees."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        disabled={isLoading}
                    />
                ) : null}
                <AuthField
                    label="Email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    note={
                        invitedEmail
                            ? "The invitation was sent to this address, so the account has to use it."
                            : "The code goes here, so use one you can open now."
                    }
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={emailLocked}
                    aria-readonly={emailLocked || undefined}
                    required
                    disabled={isLoading}
                />
                <AuthSubmit disabled={isLoading}>
                    {isLoading ? "Sending…" : "Email me a code"}
                </AuthSubmit>
            </form>

            <SocialButtons
                providers={providers}
                // Google makes the account in one step, so it goes where
                // the emailed code would have sent it: setup, unless this
                // sign-up was on its way somewhere (an invitation, a plan).
                callbackURL={returnTo ?? getOnboardingUrl()}
                disabled={isLoading}
            />

            <AuthFooter>
                Already have an account?{" "}
                <Link
                    href={withCarry(
                        "/login",
                        returnTo,
                        emailLocked ? invitedEmail : undefined,
                    )}
                    className="text-foreground decoration-border-strong hover:decoration-foreground active:text-muted-foreground underline underline-offset-4 transition-colors"
                >
                    Sign in
                </Link>
            </AuthFooter>
        </div>
    );
}
