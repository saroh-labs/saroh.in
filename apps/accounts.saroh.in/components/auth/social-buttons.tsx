"use client";

import { Button } from "@saroh/ui/button";
import { useState } from "react";
import { FaGithub, FaGoogle } from "react-icons/fa";

import { AuthDivider, AuthError } from "@/components/auth/field";
import { authClient } from "@/lib/auth.client";

/**
 * The other routes to the same account.
 *
 * Both providers, on log in AND on sign up. The server has registered GitHub
 * and Google since the auth package landed, account linking trusts both, and
 * all four credentials are declared in the build's environment — but only
 * GitHub was ever drawn, and only on log in. A provider that is configured,
 * trusted and never offered is a feature nobody can use.
 *
 * A provider with no credentials in this environment still renders. Hiding it
 * would make a misconfigured deployment look identical to a removed feature;
 * failing at the round-trip at least says something went wrong, and says it
 * to the person who can tell someone about it.
 */

const PROVIDERS = [
    { id: "github", label: "GitHub", Icon: FaGithub },
    { id: "google", label: "Google", Icon: FaGoogle },
] as const;

export function SocialButtons({
    callbackURL,
    disabled,
}: {
    /** Where the round-trip should land — already vetted by the server. */
    callbackURL?: string;
    disabled?: boolean;
}) {
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    return (
        <>
            <AuthDivider />
            {error ? <AuthError>{error}</AuthError> : null}
            <div className="grid gap-2">
                {PROVIDERS.map(({ id, label, Icon }) => (
                    <Button
                        key={id}
                        type="button"
                        variant="outline"
                        className="sa-rise h-10 w-full gap-[9px] rounded-[9px] text-[13px] font-semibold"
                        disabled={disabled === true || pending !== null}
                        onClick={async () => {
                            setError(null);
                            setPending(id);
                            const { error: err } =
                                await authClient.signIn.social({
                                    provider: id,
                                    callbackURL,
                                });
                            // Reached only when the round-trip never starts —
                            // a success navigates away from this page.
                            if (err) {
                                setError(
                                    err.message ??
                                        `${label} could not be reached. Try again, or use your email and password.`,
                                );
                            }
                            setPending(null);
                        }}
                    >
                        <Icon aria-hidden className="size-4" />
                        {pending === id
                            ? `Opening ${label}…`
                            : `Continue with ${label}`}
                    </Button>
                ))}
            </div>
        </>
    );
}
