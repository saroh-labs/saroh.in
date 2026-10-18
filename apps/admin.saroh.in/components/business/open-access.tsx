"use client";

import { Button } from "@saroh/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@saroh/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { useState, useTransition } from "react";

import { openAccessAction } from "@/lib/business-actions";

/**
 * Opening a business's page means opening a support session: read-only,
 * thirty minutes, bound to a written reason, and on the record. Nothing about
 * the business beyond its directory row is shown until it is open.
 *
 * The common reasons are one tap away; the reason still goes on the record
 * exactly as it reads in the field, so an operator can add detail first.
 */
const QUICK_REASONS = [
    "Support request from the business",
    "Checking a setting",
    "Testing on a test business",
] as const;
export function OpenAccess({
    organizationId,
    onOpened,
}: {
    organizationId: string;
    /** Called once the session is open (a dialog closes itself). */
    onOpened?: () => void;
}) {
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
                    else onOpened?.();
                });
            }}
        >
            <div className="grid gap-1.5">
                <Label htmlFor="access-reason">
                    Your reason, kept with your name in the audit trail
                </Label>
                <div className="flex flex-wrap gap-2">
                    {QUICK_REASONS.map((quick) => (
                        <Button
                            key={quick}
                            type="button"
                            size="sm"
                            variant={reason === quick ? "secondary" : "outline"}
                            disabled={pending}
                            onClick={() => setReason(quick)}
                        >
                            {quick}
                        </Button>
                    ))}
                </div>
                <Textarea
                    id="access-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Or write your own, e.g. Owner emailed: bookings page shows no slots"
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

/** What a support session is, in the words the card and the dialog share. */
function WhatAccessIs() {
    return (
        <p className="max-w-[68ch] text-sm text-muted-foreground">
            A business&rsquo;s details are its own, so every look inside one is
            on the record: pick or write a reason, and the details open
            read-only for thirty minutes, written into the audit trail with your
            name and reason. You see what an operator needs — what they see,
            people, modules, plan, trackers, activity — and never the
            business&rsquo;s own customers.
        </p>
    );
}

/**
 * The support-access card, inside a tab whose details need a session (admin
 * plan U2): the rest of the page — the header, the other tabs — stands
 * without one.
 */
export function OpenAccessCard({ organizationId }: { organizationId: string }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-[15px]">
                    Open support access
                </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
                <WhatAccessIs />
                <OpenAccess organizationId={organizationId} />
            </CardContent>
        </Card>
    );
}

/**
 * View as the business… in the header: the same reason and session as the
 * card, from wherever the operator is on the page.
 */
export function ViewAsBusiness({ organizationId }: { organizationId: string }) {
    const [open, setOpen] = useState(false);
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button type="button" variant="outline">
                    View as the business…
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>View as the business</DialogTitle>
                    <DialogDescription asChild>
                        <div>
                            <WhatAccessIs />
                        </div>
                    </DialogDescription>
                </DialogHeader>
                <OpenAccess
                    organizationId={organizationId}
                    onOpened={() => setOpen(false)}
                />
            </DialogContent>
        </Dialog>
    );
}
