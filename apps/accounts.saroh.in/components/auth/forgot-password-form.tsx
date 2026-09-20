"use client";

import { authClient } from "@/lib/auth.client";
import { Button } from "@saroh/ui/button";
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
                onError: (ctx) => setError(ctx.error.message),
            },
        );
        setIsLoading(false);
        if (err) return;
        setSent(true);
    }

    if (sent) {
        return (
            <div>
                <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                    Check your email
                </h1>
                <p className="sa-rise text-muted-foreground mb-[22px] mt-[7px] text-[13px] leading-[1.55]">
                    If an account exists for {email}, we&apos;ve sent a link to
                    reset your password.
                </p>
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
            </div>
        );
    }

    return (
        <div>
            <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                Forgot password
            </h1>
            <p className="sa-rise text-muted-foreground mb-[22px] mt-[7px] text-[13px] leading-[1.55]">
                Enter your email and we&apos;ll send you a link to reset your
                password.
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
                <div className="grid gap-2">
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
                <Button
                    type="submit"
                    className="sa-cta mt-1 w-full font-semibold"
                    disabled={isLoading}
                >
                    {isLoading ? "Sending…" : "Send reset link"}
                </Button>
            </form>
            <div className="sa-rise text-muted-foreground mt-5 text-[12.5px]">
                <Link href="/login" className="underline">
                    Back to login
                </Link>
            </div>
        </div>
    );
}
