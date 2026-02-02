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
import { useState } from "react";

export function ForgotPasswordForm() {
    const { requestPasswordReset } = authClient;
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        const redirectTo =
            typeof window !== "undefined"
                ? `${window.location.origin}/reset-password`
                : undefined;
        const { error: err } = await requestPasswordReset(
            { email, redirectTo },
            {
                onError: (ctx) =>
                    setError(ctx.error?.message ?? "Request failed"),
            }
        );
        setIsLoading(false);
        if (err) return;
        setSent(true);
    }

    if (sent) {
        return (
            <Card className="mx-auto max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Check your email</CardTitle>
                    <CardDescription>
                        If an account exists for {email}, we&apos;ve sent a
                        link to reset your password.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground text-sm">
                        Didn&apos;t receive it? Check spam or{" "}
                        <button
                            type="button"
                            className="underline"
                            onClick={() => {
                                setSent(false);
                                setError(null);
                            }}
                        >
                            try again
                        </button>
                        .
                    </p>
                    <Link
                        href="/login"
                        className="mt-4 inline-block text-sm underline"
                    >
                        Back to login
                    </Link>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="mx-auto max-w-sm">
            <CardHeader>
                <CardTitle className="text-2xl">Forgot password</CardTitle>
                <CardDescription>
                    Enter your email and we&apos;ll send you a link to reset
                    your password.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4">
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="m@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={isLoading}
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? "Sending…" : "Send reset link"}
                    </Button>
                </form>
                <div className="mt-4 text-center text-sm">
                    <Link href="/login" className="underline">
                        Back to login
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
