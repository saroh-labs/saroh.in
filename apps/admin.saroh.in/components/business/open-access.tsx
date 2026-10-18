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
 * Opening a support session: thirty minutes to read a business's own
 * details (its team's emails, notes, trackers, history), bound to a written
 * reason, and on the record. The header, Overview and Modules stand on the
 * directory's read and need none.
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
                    placeholder="Or write your own, e.g. Owner emailed: the booking page shows no times"
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

/**
 * What a support session is, in the words the card and the dialog share
 * (admin plan U6, R16). A session opens the business's own details to
 * read; it changes nothing by itself. Overview, Modules, plan and usage
 * need none, and every change is a control of its own, with its reason.
 */
export function WhatAccessIs() {
    return (
        <p className="max-w-[68ch] text-sm text-muted-foreground">
            A business&rsquo;s own details are private, so every look at them is
            on the record. Pick or write a reason and they open to read for
            thirty minutes, kept in the audit trail with your name and reason.
            You see their team&rsquo;s emails, notes, trackers and history.
            Never their customers. Overview, Modules, the plan and usage need no
            support access.
        </p>
    );
}

/**
 * The support-access card, inside a tab whose details need a session (admin
 * plan U2): the rest of the page, the header and the other tabs, stands
 * without one. `lead` says what this tab would add.
 */
export function OpenAccessCard({
    organizationId,
    lead,
}: {
    organizationId: string;
    lead?: string;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-[15px]">
                    Open support access
                </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
                {lead && <p className="max-w-[68ch] text-sm">{lead}</p>}
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
