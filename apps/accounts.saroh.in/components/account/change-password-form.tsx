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
import { useState } from "react";

/**
 * Change password for a signed-in user. Distinct from the forgot-password
 * flow: it proves possession of the CURRENT password rather than of the mailbox.
 *
 * `revokeOtherSessions` is on by default — if you are changing your password
 * because you fear someone else has it, leaving their sessions alive defeats
 * the point. It stays a visible checkbox because signing every other device
 * out is a consequence the user should see coming.
 */
export function ChangePasswordForm() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [revokeOthers, setRevokeOthers] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        if (newPassword !== confirmPassword) {
            setError("New passwords do not match");
            return;
        }
        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        setIsLoading(true);
        const { error: err } = await authClient.changePassword({
            currentPassword,
            newPassword,
            revokeOtherSessions: revokeOthers,
        });
        setIsLoading(false);

        if (err) {
            setError(err.message ?? "Could not change your password.");
            return;
        }
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                    Change the password you use to sign in.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid max-w-sm gap-4">
                    {error && (
                        <p className="text-destructive text-sm">{error}</p>
                    )}
                    {success && (
                        <p className="text-sm text-emerald-600">
                            Password updated.
                        </p>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="currentPassword">
                            Current password
                        </Label>
                        <Input
                            id="currentPassword"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            disabled={isLoading}
                        />
                    </div>
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
                            autoComplete="new-password"
                            disabled={isLoading}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="confirmNewPassword">
                            Confirm new password
                        </Label>
                        <Input
                            id="confirmNewPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={8}
                            autoComplete="new-password"
                            disabled={isLoading}
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={revokeOthers}
                            onChange={(e) => setRevokeOthers(e.target.checked)}
                            disabled={isLoading}
                        />
                        Sign out my other devices
                    </label>
                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-fit"
                    >
                        {isLoading ? "Updating…" : "Change password"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
