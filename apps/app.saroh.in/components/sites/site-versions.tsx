"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/empty-state";
import { History } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
}: {
    siteId: string;
    publications: SitePublication[];
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
                toast.error(res.error);
                return;
            }
            setConfirming(null);
            router.refresh();
            toast.success("That version is live again.");
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
                                    <p className="text-xs text-muted-foreground">
                                        Template {p.templateId} v
                                        {p.templateVersion}
                                    </p>
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

                                {p.isCurrent ? null : confirming === p.id ? (
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="brand"
                                            disabled={pending}
                                            onClick={() => onRestore(p.id)}
                                        >
                                            {pending
                                                ? "Restoring…"
                                                : "Yes, restore"}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={pending}
                                            onClick={() => setConfirming(null)}
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
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
