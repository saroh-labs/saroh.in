"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { runAction } from "@/lib/api/run-action";
import { formatDate } from "@/lib/format/datetime";
import { restoreVersionAsDraft } from "@/lib/sites/version-restore-actions";

/** "Restore 14 Nov as the draft". */
export function restoreLabel(publishedAt: string | Date, zone: string): string {
    return `Restore ${formatDate(publishedAt, zone)} as the draft`;
}

/** What the confirm says before a version replaces the draft. */
export const RESTORE_AS_DRAFT_LINE =
    "This replaces your draft with this version. It goes live only when you publish.";

/**
 * Restore a version as the draft (owner, 20 Nov 2026; #283, #194): the
 * version's pages come back into the draft, each change yours, and nothing
 * goes live until Publish. It needs the editor's own write (`section:write`),
 * not `site:publish`, and no approval: the publish that follows asks for it.
 *
 * The confirm says what changes rather than asking "are you sure?". When
 * part of this version can no longer be drawn, it says so first (#194).
 */
export function RestoreVersion({
    siteId,
    publicationId,
    publishedAt,
    isCurrent,
    renderable,
    pageId,
    revision,
    onRestored,
    icon,
    orgId,
}: {
    /** The tab's business, sent last on a React Query screen (DEC-259). */
    orgId?: string;
    siteId: string;
    publicationId: string;
    publishedAt: string | Date;
    isCurrent: boolean;
    renderable: boolean;
    /** The editor's open page and the draft revision it holds (stale: 409). */
    pageId?: string;
    revision?: number;
    /** After the draft changed: the editor's History reloads, the version's page reads the site again. */
    onRestored: () => void;
    /** Drawn before the label (History's Compare: the history icon, D3). */
    icon?: ReactNode;
}) {
    const zone = useBusinessZone();
    const [confirming, setConfirming] = useState(false);
    const [pending, startTransition] = useTransition();

    if (isCurrent) return null;
    const label = restoreLabel(publishedAt, zone);

    function restore() {
        startTransition(async () => {
            const res = await runAction(() =>
                // The editor's History sends no business: it isn't on React Query.
                orgId
                    ? restoreVersionAsDraft(
                          siteId,
                          publicationId,
                          { pageId, revision },
                          orgId,
                      )
                    : restoreVersionAsDraft(siteId, publicationId, {
                          pageId,
                          revision,
                      }),
            );
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setConfirming(false);
            showSuccess(
                "That version is your draft now. It goes live when you publish.",
            );
            onRestored();
        });
    }

    if (!confirming) {
        return (
            <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirming(true)}
            >
                {icon}
                {label}
            </Button>
        );
    }

    return (
        <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
                {RESTORE_AS_DRAFT_LINE}
            </p>
            {renderable ? null : (
                <p className="text-sm text-muted-foreground">
                    Part of this version can no longer be drawn by your site as
                    it is today, so the draft may not look the way it did.
                </p>
            )}
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="brand"
                    onClick={restore}
                    busy={pending}
                    busyLabel="Restoring…"
                >
                    {renderable ? "Restore as the draft" : "Restore anyway"}
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
