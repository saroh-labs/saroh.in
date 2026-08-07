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

/** Entrance offsets, in order of appearance. Small enough to read as one
 *  gesture rather than a sequence the user has to wait out. */
const STAGGER_MS = 70;
const FIELD_BASE_MS = 260;

function delay(index: number): React.CSSProperties {
    return {
        "--sa-delay": `${FIELD_BASE_MS + index * STAGGER_MS}ms`,
    } as React.CSSProperties;
}

export function SignupForm() {
    const router = useRouter();
    const { signUp } = authClient;
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
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
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    }

    return (
        <Card className="sa-panel mx-auto w-full max-w-sm">
            <CardHeader>
                <CardTitle
                    className="sa-rise font-display text-2xl"
                    style={delay(0)}
                >
                    Create your account
                </CardTitle>
                <CardDescription className="sa-rise" style={delay(1)}>
                    One account for every Saroh app.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4">
                    {error && (
                        <p
                            role="alert"
                            className="sa-alert border-destructive/40 bg-destructive/10 text-destructive-foreground rounded-md border px-3 py-2 text-sm"
                        >
                            {error}
                        </p>
                    )}
                    <div className="sa-rise grid gap-2" style={delay(2)}>
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            className="sa-input"
                            type="text"
                            placeholder="Your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            disabled={isLoading}
                        />
                    </div>
                    <div className="sa-rise grid gap-2" style={delay(3)}>
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
                    <div className="sa-rise grid gap-2" style={delay(4)}>
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            className="sa-input"
                            type="password"
                            placeholder="At least 8 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            disabled={isLoading}
                        />
                    </div>
                    <Button
                        type="submit"
                        variant="highlight"
                        className="sa-cta sa-rise mt-1 w-full font-semibold"
                        style={delay(5)}
                        disabled={isLoading}
                    >
                        {isLoading ? "Creating account…" : "Create account"}
                    </Button>
                </form>
                <div
                    className="sa-rise text-muted-foreground mt-5 text-center text-sm"
                    style={delay(6)}
                >
                    Already have an account?{" "}
                    <Link
                        href="/login"
                        className="text-foreground underline-offset-4 transition-colors hover:underline"
                    >
                        Log in
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
