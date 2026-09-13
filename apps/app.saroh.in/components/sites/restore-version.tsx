"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { restorePublication } from "@/lib/sites/actions";

/**
 * Put the version being previewed back (#283, #194).
 *
 * The confirm states what will change rather than asking "are you sure?", as
 * the version list does. When part of this version can no longer be drawn,
 * it says so before the merchant commits to it: #194 asks restore to warn
 * rather than quietly putting a broken page in front of visitors.
 */
export function RestoreVersion({
    siteId,
    publicationId,
    isCurrent,
    renderable,
}: {
    siteId: string;
    publicationId: string;
    isCurrent: boolean;
    renderable: boolean;
}) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [pending, startTransition] = useTransition();

    if (isCurrent) return null;

    function restore() {
        startTransition(async () => {
            const res = await restorePublication(siteId, publicationId);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess("That version is live again.");
            router.push(`/sites/${siteId}/versions`);
            router.refresh();
        });
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
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="brand"
                    disabled={pending}
                    onClick={restore}
                >
                    {pending
                        ? "Restoring…"
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
