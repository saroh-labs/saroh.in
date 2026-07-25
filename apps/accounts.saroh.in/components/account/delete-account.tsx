"use client";

import { env } from "@/env";
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
import { useEffect, useState } from "react";

interface SoleOwnedOrg {
    id: string;
    name: string;
    slug: string;
}

const CONFIRM_PHRASE = "delete my account";

/**
 * Danger zone: permanent account deletion.
 *
 * Two things guard it. First a PRE-FLIGHT against the API: deleting the only
 * OWNER of an Organization would strand that tenant (the org, its stores, sites
 * and orders survive with nobody able to reach them), so `@saroh/auth`'s
 * `beforeDelete` hook refuses it — but that hook only fires after the user
 * follows the emailed link, and being refused *after* committing is a bad way to
 * learn a rule. We surface it here instead, before anything is sent. The hook
 * remains the authority; this is only the earlier, kinder telling.
 *
 * Second, deletion always completes through an emailed one-time link, so a
 * hijacked session alone cannot destroy an account.
 */
export function DeleteAccount() {
    const apiUrl = env.NEXT_PUBLIC_BETTER_AUTH_URL;
    // Seeded rather than set from the effect: with no API URL there is nothing
    // to ask (the auth client reads the same variable, so the whole page would
    // be non-functional), and `null` means "still checking" — which keeps the
    // form disabled.
    const [soleOwned, setSoleOwned] = useState<SoleOwnedOrg[] | null>(
        apiUrl ? null : [],
    );
    const [confirm, setConfirm] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!apiUrl) return;
        void fetch(`${apiUrl}/organizations/sole-owned`, {
            credentials: "include",
        })
            .then((res) => (res.ok ? res.json() : []))
            .then((orgs: SoleOwnedOrg[]) =>
                setSoleOwned(Array.isArray(orgs) ? orgs : []),
            )
            // A failed pre-flight must not imply "safe to delete" — leave the
            // list unknown (null keeps the form disabled) rather than guessing.
            .catch(() => setError("Could not check your organizations."));
    }, [apiUrl]);

    const blocked = soleOwned === null || soleOwned.length > 0;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        const { error: err } = await authClient.deleteUser({
            password,
            callbackURL: "/login",
        });
        setIsLoading(false);
        if (err) {
            setError(err.message ?? "Could not start account deletion.");
            return;
        }
        setSent(true);
    }

    return (
        <Card className="border-destructive/50">
            <CardHeader>
                <CardTitle className="text-destructive">
                    Delete account
                </CardTitle>
                <CardDescription>
                    Permanently deletes your Saroh account. This cannot be
                    undone.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {sent ? (
                    <p className="text-sm">
                        Check your inbox — deletion completes only when you
                        follow the confirmation link.
                    </p>
                ) : (
                    <div className="grid gap-4">
                        {error && (
                            <p className="text-destructive text-sm">{error}</p>
                        )}

                        {soleOwned && soleOwned.length > 0 && (
                            <div className="bg-muted grid gap-1 rounded-md p-3 text-sm">
                                <span className="font-medium">
                                    You are the only owner of{" "}
                                    {soleOwned.length === 1
                                        ? "an organization"
                                        : `${soleOwned.length} organizations`}
                                    :
                                </span>
                                <span>
                                    {soleOwned.map((o) => o.name).join(", ")}
                                </span>
                                <span className="text-muted-foreground">
                                    Make someone else an owner, or delete the
                                    organization, before deleting your account —
                                    otherwise its data would be left with no one
                                    able to reach it.
                                </span>
                            </div>
                        )}

                        <form
                            onSubmit={handleSubmit}
                            className="grid max-w-sm gap-4"
                        >
                            <div className="grid gap-2">
                                <Label htmlFor="deletePassword">
                                    Your password
                                </Label>
                                <Input
                                    id="deletePassword"
                                    type="password"
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                    required
                                    autoComplete="current-password"
                                    disabled={blocked || isLoading}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="deleteConfirm">
                                    Type “{CONFIRM_PHRASE}” to confirm
                                </Label>
                                <Input
                                    id="deleteConfirm"
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    disabled={blocked || isLoading}
                                />
                            </div>
                            <Button
                                type="submit"
                                variant="destructive"
                                className="w-fit"
                                disabled={
                                    blocked ||
                                    isLoading ||
                                    confirm.trim().toLowerCase() !==
                                        CONFIRM_PHRASE
                                }
                            >
                                {isLoading ? "Sending…" : "Delete my account"}
                            </Button>
                        </form>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
