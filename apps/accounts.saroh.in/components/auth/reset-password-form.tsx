"use client";

import { authClient } from "@/lib/auth.client";
import { Button } from "@saroh/ui/button";
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

    if (!token) {
        return (
            <div>
                <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                    Invalid link
                </h1>
                <p className="sa-rise text-muted-foreground mb-[22px] mt-[7px] text-[13px] leading-[1.55]">
                    This reset link is missing a token. Request a new password
                    reset from the login page.
                </p>
                <Link href="/forgot-password" className="text-sm underline">
                    Request new reset link
                </Link>
            </div>
        );
    }

    if (errorParam === "INVALID_TOKEN") {
        return (
            <div>
                <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                    Link expired
                </h1>
                <p className="sa-rise text-muted-foreground mb-[22px] mt-[7px] text-[13px] leading-[1.55]">
                    This reset link is invalid or has expired. Request a new
                    one.
                </p>
                <Link href="/forgot-password" className="text-sm underline">
                    Request new reset link
                </Link>
            </div>
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
        // A route, not a flash: ending every other session is consequential
        // enough that the person it happened to should be able to sit with the
        // page rather than watch it vanish on a timer.
        router.push("/reset-password/done");
    }

    return (
        <div>
            <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                Set new password
            </h1>
            <p className="sa-rise text-muted-foreground mb-[22px] mt-[7px] text-[13px] leading-[1.55]">
                Enter your new password below.
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
                    <Label htmlFor="newPassword">New password</Label>
                    <Input
                        id="newPassword"
                        className="sa-input"
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
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                    <Input
                        id="confirmPassword"
                        className="sa-input"
                        type="password"
                        placeholder="Repeat password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                        disabled={isLoading}
                    />
                </div>
                {/*
                 * The consequence, BEFORE the button that causes it.
                 *
                 * `revokeSessionsOnPasswordReset` is on, so saving here signs
                 * this person out of every other device. The panel beside the
                 * form says so too, but the panel is gone below 760px and a
                 * consequence this size cannot live only in the half that
                 * disappears.
                 */}
                <p className="sa-rise text-muted-foreground mt-1 text-pretty text-[11.5px] leading-[1.45]">
                    Saving a new password signs you out everywhere else — every
                    other browser and device, including any you no longer have.
                </p>
                <Button
                    type="submit"
                    className="sa-cta mt-1 w-full font-semibold"
                    disabled={isLoading}
                >
                    {isLoading ? "Resetting…" : "Save new password"}
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

export function ResetPasswordForm() {
    return (
        <Suspense
            fallback={
                <div>
                    <p className="text-muted-foreground text-sm">Loading…</p>
                </div>
            }
        >
            <ResetPasswordFormInner />
        </Suspense>
    );
}
