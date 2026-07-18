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
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetPasswordFormInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");
    const errorParam = searchParams.get("error");
    const { resetPassword } = authClient;
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    if (!token) {
        return (
            <Card className="mx-auto max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Invalid link</CardTitle>
                    <CardDescription>
                        This reset link is missing a token. Request a new
                        password reset from the login page.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Link href="/forgot-password" className="text-sm underline">
                        Request new reset link
                    </Link>
                </CardContent>
            </Card>
        );
    }

    if (errorParam === "INVALID_TOKEN") {
        return (
            <Card className="mx-auto max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Link expired</CardTitle>
                    <CardDescription>
                        This reset link is invalid or has expired. Request a new
                        one.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Link href="/forgot-password" className="text-sm underline">
                        Request new reset link
                    </Link>
                </CardContent>
            </Card>
        );
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        if (!token) {
            setError("This reset link is missing a token.");
            return;
        }
        setIsLoading(true);
        const { error: err } = await resetPassword(
            { newPassword, token },
            {
                onError: (ctx) => setError(ctx.error.message),
            },
        );
        setIsLoading(false);
        if (err) return;
        setSuccess(true);
        setTimeout(() => router.push("/login"), 2000);
    }

    if (success) {
        return (
            <Card className="mx-auto max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Password reset</CardTitle>
                    <CardDescription>
                        Your password has been updated. Redirecting to login…
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Link href="/login" className="text-sm underline">
                        Go to login
                    </Link>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="mx-auto max-w-sm">
            <CardHeader>
                <CardTitle className="text-2xl">Set new password</CardTitle>
                <CardDescription>
                    Enter your new password below.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4">
                    {error && (
                        <p className="text-destructive text-sm">{error}</p>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="newPassword">New password</Label>
                        <Input
                            id="newPassword"
                            type="password"
                            placeholder="At least 8 characters"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            minLength={8}
                            disabled={isLoading}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="confirmPassword">
                            Confirm password
                        </Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            placeholder="Repeat password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={8}
                            disabled={isLoading}
                        />
                    </div>
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading}
                    >
                        {isLoading ? "Resetting…" : "Reset password"}
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

export function ResetPasswordForm() {
    return (
        <Suspense
            fallback={
                <Card className="mx-auto max-w-sm">
                    <CardContent className="pt-6">
                        <p className="text-muted-foreground text-sm">
                            Loading…
                        </p>
                    </CardContent>
                </Card>
            }
        >
            <ResetPasswordFormInner />
        </Suspense>
    );
}
