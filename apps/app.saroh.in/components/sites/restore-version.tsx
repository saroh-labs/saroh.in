"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { restorePublication } from "@/lib/sites/actions";
import { RESTORE_OVERRIDE_LINE, restoreGate } from "@/lib/sites/release-review";

/**
 * Put the version being previewed back (#283, #194).
 *
 * The confirm states what will change rather than asking "are you sure?", as
 * the version list does. When part of this version can no longer be drawn,
 * it says so before the merchant commits to it: #194 asks restore to warn
 * rather than quietly putting a broken page in front of visitors.
 *
 * With "Publishing needs approval" on (DEC-071, Q3), only an owner can
 * restore, and it is recorded as gone live without approval: the confirm
 * says so and turns destructive. Anyone else reads why beside the control.
 */
export function RestoreVersion({
    siteId,
    publicationId,
    isCurrent,
    renderable,
    needsApproval = false,
    canOverride = false,
}: {
    siteId: string;
    publicationId: string;
    isCurrent: boolean;
    renderable: boolean;
    needsApproval?: boolean;
    canOverride?: boolean;
}) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [pending, startTransition] = useTransition();
    const gate = restoreGate({
        publishNeedsApproval: needsApproval,
        canOverride,
    });
    const override = gate.kind === "override";

    if (isCurrent) return null;

    function restore() {
        startTransition(async () => {
            const res = await restorePublication(
                siteId,
                publicationId,
                override,
            );
            if (!res.ok) {
                showError(res.error);
                if (res.code === "APPROVAL_REQUIRED") router.refresh();
                return;
            }
            showSuccess(
                override
                    ? "That version is live again. Going live without approval is recorded in version history."
                    : "That version is live again.",
            );
            router.push(`/sites/${siteId}/versions`);
            router.refresh();
        });
    }

    if (gate.kind === "blocked") {
        return (
            <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="outline" disabled>
                    Restore this version
                </Button>
                <p className="text-xs text-muted-foreground">{gate.why}</p>
            </div>
        );
    }

    if (!confirming) {
        return (
            <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirming(true)}
            >
                Restore this version
            </Button>
        );
    }

    return (
        <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
                This replaces what visitors see now. Nothing is deleted: this
                version is published again as a new entry, so you can undo it
                from version history. Your unpublished draft is left alone.
            </p>
            {renderable ? null : (
                <p className="text-sm text-muted-foreground">
                    Part of this version can no longer be drawn by your site as
                    it is today, so the live site may not look the way it did.
                </p>
            )}
            {override ? (
                <p
                    role="note"
                    className="rounded-lg bg-destructive-subtle px-3.5 py-3 text-[12.5px] leading-normal text-destructive-subtle-foreground"
                >
                    {RESTORE_OVERRIDE_LINE}
                </p>
            ) : null}
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant={override ? "destructive" : "brand"}
                    disabled={pending}
                    onClick={restore}
                >
                    {pending
                        ? "Restoring…"
                        : override
                          ? "Restore without approval"
                          : renderable
                            ? "Yes, restore"
                            : "Restore anyway"}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setConfirming(false)}
                >
                    Cancel
                </Button>
            </div>
        </div>
    );
}
