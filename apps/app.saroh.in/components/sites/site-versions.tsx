"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/empty-state";
import { showError, showSuccess } from "@saroh/ui/toast";
import { History } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { restorePublication } from "@/lib/sites/actions";
import { exactDate } from "@/lib/sites/format-date";
import type { SitePublication } from "@/lib/sites/service";

/**
 * A site's publish history, and a way back (#194).
 *
 * Restoring APPENDS a new publication carrying the chosen snapshot rather than
 * deleting the ones after it. Nothing is lost, and a restore can itself be
 * restored — which is what makes trying one safe.
 *
 * The confirm states what will change rather than asking "are you sure?": the
 * merchant is replacing what the public currently sees, and the date they are
 * replacing it with is the fact that decides it.
 */
export function SiteVersions({
    siteId,
    publications,
    changesRequested,
}: {
    siteId: string;
    publications: SitePublication[];
    /**
     * A reviewer's change request is outstanding (#279). Restoring still works,
     * because the rule is recorded, not prevented. But the confirm says so
     * before it happens, as the pre-publish check does for a publish.
     */
    changesRequested: boolean;
}) {
    const router = useRouter();
    const [confirming, setConfirming] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    if (publications.length === 0) {
        return (
            <EmptyState
                icon={<History />}
                title="Never published"
                description="Once you publish this site, every version is kept here and you can put an earlier one back."
            />
        );
    }

    const current = publications.find((p) => p.isCurrent);

    function onRestore(publicationId: string) {
        startTransition(async () => {
            const res = await restorePublication(siteId, publicationId);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setConfirming(null);
            router.refresh();
            showSuccess(
                res.data.bypassed
                    ? "That version is live again. Going live without approval is recorded in this list."
                    : "That version is live again.",
            );
        });
    }

    return (
        <div className="space-y-3">
            {publications.map((p) => {
                const when = new Date(p.publishedAt);
                return (
                    <Card key={p.id} className="wk-surface">
                        <CardContent className="space-y-3 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">
                                            {exactDate(when)}
                                        </span>
                                        {p.isCurrent ? (
                                            // Marked, not implied by position:
                                            // after a restore the live version
                                            // is not the newest by content.
                                            <Badge className="bg-success text-success-foreground">
                                                Live
                                            </Badge>
                                        ) : null}
                                    </div>
                                    {/*
                                     * Who put it live (#283), and whether a
                                     * reviewer approved it (#278).
                                     *
                                     * The row used to read "Template starter
                                     * v1", which every publication is stamped
                                     * with and so told a merchant nothing.
                                     *
                                     * The route line appears only when it says
                                     * something to act on: a bypass already
                                     * has the warning below, and "nobody was
                                     * asked" is the ordinary case — repeating
                                     * it down a list of fifteen versions is
                                     * noise.
                                     */}
                                    <p className="text-xs text-muted-foreground">
                                        {p.publishedBy
                                            ? `Published by ${p.publishedBy}`
                                            : "Publisher not recorded"}
                                    </p>
                                    {p.reviewRoute === "APPROVED" ? (
                                        <p className="text-xs text-muted-foreground">
                                            A reviewer approved this version
                                        </p>
                                    ) : null}
                                    {p.bypass ? (
                                        /*
                                         * The record the epic asked for (#199):
                                         * this version went live past a
                                         * reviewer's change request. Said
                                         * plainly, with who, where the version
                                         * is listed — never prevented, never
                                         * hidden.
                                         */
                                        <p className="mt-1 text-xs text-warning">
                                            Published without approval by{" "}
                                            {p.bypass.by} — a reviewer had asked
                                            for changes.
                                        </p>
                                    ) : null}
                                </div>

                                {/* One actions group: with these loose in a
                                 * justify-between row, Preview drifted into
                                 * the dead space between the date and
                                 * Restore. */}
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="ghost" asChild>
                                        <Link
                                            href={`/sites/${siteId}/versions/${p.id}`}
                                        >
                                            Preview
                                        </Link>
                                    </Button>
                                    {p.isCurrent ? null : confirming ===
                                      p.id ? (
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="brand"
                                                disabled={pending}
                                                onClick={() => onRestore(p.id)}
                                            >
                                                {pending
                                                    ? "Restoring…"
                                                    : changesRequested
                                                      ? "Restore without approval"
                                                      : "Yes, restore"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={pending}
                                                onClick={() =>
                                                    setConfirming(null)
                                                }
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setConfirming(p.id)}
                                        >
                                            Restore
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {confirming === p.id ? (
                                <p className="border-t pt-3 text-sm text-muted-foreground">
                                    This replaces what visitors see now
                                    {current
                                        ? ` (published ${exactDate(current.publishedAt)})`
                                        : ""}
                                    . Nothing is deleted — this version is
                                    published again as a new entry, so you can
                                    undo it from this same list. Your
                                    unpublished draft is left alone.
                                    {changesRequested
                                        ? " A reviewer has asked for changes, so this goes live without their approval, and this list will record that it did."
                                        : null}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
