"use client";

import { Button } from "@saroh/ui/button";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { useState, useTransition } from "react";

import { openAccessAction } from "@/lib/business-actions";

/**
 * Opening a business's page means opening a support session: read-only,
 * thirty minutes, bound to a written reason, and on the record. Nothing about
 * the business beyond its directory row is shown until it is open.
 */
export function OpenAccess({ organizationId }: { organizationId: string }) {
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const ok = reason.trim().length >= 4;

    return (
        <form
            className="grid gap-3"
            onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                startTransition(async () => {
                    const result = await openAccessAction(organizationId, {
                        reason: reason.trim(),
                        idempotencyKey: crypto.randomUUID(),
                    });
                    if (!result.ok) setError(result.error);
                });
            }}
        >
            <div className="grid gap-1.5">
                <Label htmlFor="access-reason">
                    Why are you opening this business?
                </Label>
                <Textarea
                    id="access-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Owner emailed: bookings page shows no slots"
                    rows={3}
                    minLength={4}
                    maxLength={500}
                    required
                    disabled={pending}
                />
            </div>
            {error && (
                <p className="text-sm text-destructive" role="alert">
                    {error}
                </p>
            )}
            <div>
                <Button type="submit" disabled={!ok || pending}>
                    {pending ? "Opening…" : "Open support access"}
                </Button>
            </div>
        </form>
    );
}
