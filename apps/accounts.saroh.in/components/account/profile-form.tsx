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
 * Display name. The only freely editable identity field — email is the login
 * identity and moves through the verified change-email flow instead.
 */
export function ProfileForm({ initialName }: { initialName: string }) {
    const [name, setName] = useState(initialName);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSaved(false);
        setIsLoading(true);
        const { error: err } = await authClient.updateUser({ name });
        setIsLoading(false);
        if (err) {
            setError(err.message ?? "Could not save your name.");
            return;
        }
        setSaved(true);
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Your profile</CardTitle>
                <CardDescription>
                    The name shown to your teammates across Saroh.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid max-w-sm gap-4">
                    {error && (
                        <p className="text-destructive text-sm">{error}</p>
                    )}
                    {saved && (
                        <p className="text-sm text-emerald-600">Name saved.</p>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                setSaved(false);
                            }}
                            required
                            maxLength={120}
                            disabled={isLoading}
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={isLoading || name === initialName}
                        className="w-fit"
                    >
                        {isLoading ? "Saving…" : "Save"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
