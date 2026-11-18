"use client";

import { Button } from "@saroh/ui/button";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { ListCard, ListRow } from "@saroh/ui/list-card";
import { showSuccess } from "@saroh/ui/toast";
import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { removeSiteRedirect } from "@/lib/sites/actions";
import type { SitePage, SiteRedirect } from "@/lib/sites/service";

import { AddOldLinkSheet } from "./add-old-link-sheet";

/** Why an old link forwards, as the row says it. */
export function whyLine(r: Pick<SiteRedirect, "source" | "live">): string {
    const why =
        r.source === "AUTO"
            ? "Made for you when the page link changed"
            : "Added by hand";
    return r.live ? why : `${why} · goes live when you publish`;
}

/**
 * Links and sharing › Old links that forward here (WXPLinks): every old
 * link and the page it opens. One the merchant added can be removed; one
 * made for them when a page link changed can't, since someone may still
 * have it on a card or in a message (owner decision O2: forever), and the
 * row's foot says so. A reader sees the list only.
 */
export function OldLinksList({
    siteId,
    host,
    pages,
    redirects,
    canEdit,
}: {
    siteId: string;
    host: string | null;
    pages: readonly Pick<SitePage, "path" | "title">[];
    /** Null: couldn't be read, which is not "none yet". */
    redirects: readonly SiteRedirect[] | null;
    canEdit: boolean;
}) {
    const router = useRouter();
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState<SiteRedirect | null>(null);
    const hasAuto = redirects?.some((r) => r.source === "AUTO") ?? false;

    return (
        <section aria-labelledby="old-links" className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <div className="grid min-w-0 flex-1 basis-64 gap-1">
                    <h2 id="old-links" className="text-base font-semibold">
                        Old links that forward here
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        When you change a page link, the old one keeps working.
                        Add your own for a link printed somewhere else.
                    </p>
                </div>
                {canEdit ? (
                    <Button variant="outline" onClick={() => setAdding(true)}>
                        Add an old link
                    </Button>
                ) : null}
            </div>

            {redirects === null ? (
                <FailedState
                    size="panel"
                    title={couldntLoad("old links")}
                    onRetry={() => router.refresh()}
                />
            ) : redirects.length === 0 ? (
                <EmptyState
                    size="panel"
                    icon={<Link2 />}
                    title="No old links yet"
                    description="One is made for you when you change a page link."
                />
            ) : (
                <ListCard
                    main="Old link"
                    end={canEdit ? "" : "Forwards to"}
                    note={
                        hasAuto
                            ? "Old links made for you can't be removed: someone may still have them on a card or in a message."
                            : undefined
                    }
                >
                    {redirects.map((r) => (
                        <li
                            key={r.id}
                            className="border-b border-border last:border-b-0"
                        >
                            <ListRow
                                title={
                                    <span className="break-all font-mono text-[13px]">
                                        {r.fromPath}
                                    </span>
                                }
                                sub={
                                    <>
                                        Forwards to{" "}
                                        <span className="font-mono">
                                            {r.toPath}
                                        </span>
                                        {r.toTitle ? ` (${r.toTitle})` : ""}
                                        {" · "}
                                        {whyLine(r)}
                                        {" · "}
                                        <ViewerDate iso={r.createdAt} />
                                    </>
                                }
                                end={
                                    canEdit && r.source === "OWN" ? (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            aria-label={`Remove ${r.fromPath}`}
                                            onClick={() => setRemoving(r)}
                                        >
                                            Remove
                                        </Button>
                                    ) : null
                                }
                            />
                        </li>
                    ))}
                </ListCard>
            )}

            {canEdit ? (
                <AddOldLinkSheet
                    siteId={siteId}
                    host={host}
                    pages={pages}
                    open={adding}
                    onClose={() => setAdding(false)}
                />
            ) : null}
            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(o) => (o ? null : setRemoving(null))}
                title={`Remove ${removing?.fromPath ?? "this old link"}?`}
                description="Once you publish, anyone who opens it lands on a page that isn't there."
                confirmLabel="Remove old link"
                keepLabel="Keep old link"
                onConfirm={async () => {
                    if (!removing) return;
                    const res = await removeSiteRedirect(siteId, removing.id);
                    if (!res.ok) return res;
                    setRemoving(null);
                    showSuccess("Old link removed. It stops once you publish.");
                    router.refresh();
                }}
            />
        </section>
    );
}
