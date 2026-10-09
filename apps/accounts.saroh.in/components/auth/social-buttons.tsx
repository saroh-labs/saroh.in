"use client";

import { Button } from "@saroh/ui/button";
import { useState } from "react";
import { FaGithub, FaGoogle } from "react-icons/fa";

import { AuthDivider, AuthError } from "@/components/auth/field";
import { authClient } from "@/lib/auth.client";
import type { SocialProvider } from "@/lib/sign-in-options";

/**
 * The other routes to the same account.
 *
 * Both providers, on log in AND on sign up — but only those whose keys are set
 * on the API (`providers`, from `lib/sign-in-options.ts`). A provider without
 * keys failed at the round-trip on the live sign-in page, so it isn't drawn
 * (owner, 9 Oct); setting its keys brings it back. With none, nothing is
 * drawn, not even the divider: email and password are the whole page.
 */

const PROVIDERS = [
    { id: "google", label: "Google", Icon: FaGoogle },
    { id: "github", label: "GitHub", Icon: FaGithub },
] as const;

export function SocialButtons({
    providers,
    callbackURL,
    disabled,
}: {
    /** The providers with keys set; only these are drawn. */
    providers: readonly SocialProvider[];
    /** Where the round-trip should land — already vetted by the server. */
    callbackURL?: string;
    disabled?: boolean;
}) {
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const shown = PROVIDERS.filter((p) => providers.includes(p.id));
    if (shown.length === 0) return null;

    return (
        <>
            <AuthDivider />
            {error ? <AuthError>{error}</AuthError> : null}
            <div className="grid gap-2">
                {shown.map(({ id, label, Icon }) => (
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
