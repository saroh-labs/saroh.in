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
 * Change the sign-in email.
 *
 * The confirmation link goes to the CURRENT address, not the new one — the
 * holder of the existing mailbox authorizes the move, so someone who briefly
 * has your session cannot walk your account to an address they control. Nothing
 * changes until that link is followed, which is why the success copy points at
 * the old inbox and the field is left filled in.
 */
export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
    const [newEmail, setNewEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSent(false);

        if (newEmail.trim().toLowerCase() === currentEmail.toLowerCase()) {
            setError("That is already your email address.");
            return;
        }

        setIsLoading(true);
        const { error: err } = await authClient.changeEmail({
            newEmail: newEmail.trim(),
            callbackURL: "/account",
        });
        setIsLoading(false);

        if (err) {
            setError(err.message ?? "Could not start the email change.");
            return;
        }
        setSent(true);
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Email address</CardTitle>
                <CardDescription>
                    You sign in with <strong>{currentEmail}</strong>. Changing
                    it needs confirmation from that inbox.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid max-w-sm gap-4">
                    {error && (
                        <p className="text-destructive text-sm">{error}</p>
                    )}
                    {sent && (
                        <p className="text-success text-sm">
                            Check {currentEmail} for a confirmation link. Your
                            email changes only once you follow it.
                        </p>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="newEmail">New email</Label>
                        <Input
                            id="newEmail"
                            type="email"
                            value={newEmail}
                            onChange={(e) => {
                                setNewEmail(e.target.value);
                                setSent(false);
                            }}
                            required
                            disabled={isLoading}
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-fit"
                    >
                        {isLoading ? "Sending…" : "Send confirmation"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
