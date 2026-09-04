"use client";

import { authClient } from "@/lib/auth.client";
import { Button } from "@saroh/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";

const STAGGER_MS = 70;
const FIELD_BASE_MS = 260;

function delay(index: number): React.CSSProperties {
    return {
        "--sa-delay": `${FIELD_BASE_MS + index * STAGGER_MS}ms`,
    } as React.CSSProperties;
}

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
        <Card className="sa-panel mx-auto w-full max-w-sm">
            <CardHeader>
                <CardTitle
                    className="sa-rise font-display text-2xl"
                    style={delay(0)}
                >
                    Welcome back
                </CardTitle>
                <CardDescription className="sa-rise" style={delay(1)}>
                    Log in to continue to your workspace.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4">
                    {error && (
                        <p
                            role="alert"
                            className="sa-alert border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
                        >
                            {error}
                        </p>
                    )}
                    <div className="sa-rise grid gap-2" style={delay(2)}>
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
                    <div className="sa-rise grid gap-2" style={delay(3)}>
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
                        variant="highlight"
                        className="sa-cta sa-rise mt-1 w-full font-semibold"
                        style={delay(4)}
                        disabled={isLoading}
                    >
                        {isLoading ? "Signing in…" : "Log in"}
                    </Button>

                    {/* Divider rather than a second stacked button: it makes
                        clear that GitHub is an alternative route to the same
                        place, not a second thing to do. */}
                    <div
                        className="sa-rise flex items-center gap-3"
                        style={delay(5)}
                    >
                        <span className="bg-border/70 h-px flex-1" />
                        <span className="text-muted-foreground text-xs uppercase tracking-wide">
                            or
                        </span>
                        <span className="bg-border/70 h-px flex-1" />
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        className="sa-rise w-full gap-2 transition-transform duration-150 active:scale-[0.985]"
                        style={delay(6)}
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
                <div
                    className="sa-rise text-muted-foreground mt-5 text-center text-sm"
                    style={delay(7)}
                >
                    Don&apos;t have an account?{" "}
                    <Link
                        href="/signup"
                        className="text-foreground underline-offset-4 transition-colors hover:underline"
                    >
                        Sign up
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
