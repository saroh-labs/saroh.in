"use client";

import { authClient } from "@/lib/auth.client";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";

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
            {/* "Welcome back" moved to the panel beside this form; the heading
                names the act, as the design does on all five pages. */}
            <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                Log in
            </h1>
            <p className="sa-rise text-muted-foreground mb-[22px] mt-[7px] text-[13px] leading-[1.55]">
                Continue to your workspace.
            </p>
            <form onSubmit={handleSubmit} className="grid gap-4">
                {error && (
                    <p
                        role="alert"
                        className="sa-alert border-destructive/40 bg-destructive-subtle text-destructive-subtle-foreground rounded-md border px-3 py-2 text-sm"
                    >
                        {error}
                    </p>
                )}
                <div className="sa-rise grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        className="sa-input"
                        type="email"
                        placeholder="m@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isLoading}
                    />
                </div>
                <div className="sa-rise grid gap-2">
                    <div className="flex items-center">
                        <Label htmlFor="password">Password</Label>
                        <Link
                            href="/forgot-password"
                            className="text-muted-foreground hover:text-foreground ml-auto inline-block text-sm underline-offset-4 transition-colors hover:underline"
                        >
                            Forgot your password?
                        </Link>
                    </div>
                    <Input
                        id="password"
                        className="sa-input"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isLoading}
                    />
                </div>
                <Button
                    type="submit"
                    className="sa-cta sa-rise mt-1 w-full font-semibold"
                    disabled={isLoading}
                >
                    {isLoading ? "Signing in…" : "Log in"}
                </Button>

                {/* Divider rather than a second stacked button: it makes
                        clear that GitHub is an alternative route to the same
                        place, not a second thing to do. */}
                <div className="sa-rise flex items-center gap-3">
                    <span className="bg-border/70 h-px flex-1" />
                    <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.1em]">
                        or
                    </span>
                    <span className="bg-border/70 h-px flex-1" />
                </div>

                <Button
                    type="button"
                    variant="outline"
                    className="sa-rise w-full gap-2"
                    disabled={isLoading}
                    onClick={async () => {
                        setError(null);
                        await signIn.social({
                            provider: "github",
                            callbackURL: returnTo,
                        });
                    }}
                >
                    <FaGithub aria-hidden className="size-4" />
                    Continue with GitHub
                </Button>
            </form>
            <p className="sa-rise text-muted-foreground mt-5 text-[12.5px]">
                No account yet?{" "}
                <Link
                    href={`/signup?redirect=${encodeURIComponent(returnTo)}`}
                    className="text-foreground underline-offset-4 transition-colors hover:underline"
                >
                    Create one
                </Link>
            </p>
        </div>
    );
}
