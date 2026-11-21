"use client";

import { formatDateTime } from "@/lib/format/datetime";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/empty-state";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { CalendarClock, History } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import {
    RESTORE_AS_DRAFT_LINE,
    restoreLabel,
} from "@/components/sites/versions/restore-version";
import { runAction } from "@/lib/api/run-action";
import type { VersionBadgeTone } from "@/lib/sites/release-review";
import { releaseTitle, versionRowCopy } from "@/lib/sites/release-review";
import type { SitePublication } from "@/lib/sites/service";
import type { TestRelease } from "@/lib/sites/test-releases";
import { releaseStatusCopy } from "@/lib/sites/test-releases";
import { restoreVersionAsDraft } from "@/lib/sites/version-restore-actions";
import { FailedRead } from "@saroh/ui/failed-read";

const BADGE: Record<
    VersionBadgeTone,
    "success" | "neutral" | "warning" | "error"
> = {
    success: "success",
    neutral: "neutral",
    warning: "warning",
    error: "error",
};

/**
 * What version history knows of the site's scheduled go-lives (T12): the
 * releases waiting to go live, `failed` when the list couldn't be read (said,
 * never shown as "nothing scheduled"), or null while test releases are off.
 */
export type ScheduledGoLives =
    | { state: "on"; releases: TestRelease[]; zone: string }
    | { state: "failed" }
    | null;

/**
 * A site's publish history, and a way back (#194).
 *
 * Restore copies a version into the draft (owner, 20 Nov 2026): nothing
 * goes live until Publish, and the versions list is untouched, so trying
 * one is safe. The confirm says so rather than asking "are you sure?".
 *
 * Since DEC-071 (T12) each version says which test release it went live
 * from, an owner's override sits beside a bypass, and a go-live that is
 * scheduled but hasn't happened is listed above the versions.
 */
export function SiteVersions({
    siteId,
    publications,
    canRestore,
    scheduled = null,
}: {
    siteId: string;
    publications: SitePublication[];
    /**
     * Whether this caller may restore a version as the draft: the editor's
     * own write (`section:write`). Without it the control is absent.
     */
    canRestore: boolean;
    scheduled?: ScheduledGoLives;
}) {
    const zone = useBusinessZone();
    const router = useRouter();
    const [confirming, setConfirming] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const upcoming = <ScheduledList siteId={siteId} scheduled={scheduled} />;

    if (publications.length === 0) {
        return (
            <div className="space-y-3">
                {upcoming}
                <EmptyState
                    icon={<History />}
                    title="No versions yet"
                    description="Once you publish this site, every version is kept here and you can put an earlier one back."
                />
            </div>
        );
    }

    function onRestore(publicationId: string) {
        startTransition(async () => {
            const res = await runAction(() =>
                restoreVersionAsDraft(siteId, publicationId),
            );
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setConfirming(null);
            router.refresh();
            showSuccess(
                "That version is your draft now. It goes live when you publish.",
            );
        });
    }

    return (
        <div className="space-y-3">
            {upcoming}
            {publications.map((p) => {
                const when = new Date(p.publishedAt);
                const copy = versionRowCopy(p);
                return (
                    <Card key={p.id} className="wk-surface">
                        <CardContent className="space-y-3 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium">
                                            {formatDateTime(when, zone, {
                                                year: "always",
                                            })}
                                        </span>
                                        {/*
                                         * Live is marked, not implied by
                                         * position: after a restore the live
                                         * version is not the newest by
                                         * content. Beside it, how this
                                         * version got past its reviewers:
                                         * Approved, Bypassed, or Overridden
                                         * by an owner (T12).
                                         */}
                                        {copy.badges.map((b) => (
                                            <Badge
                                                key={b.label}
                                                variant={BADGE[b.tone]}
                                            >
                                                {b.label}
                                            </Badge>
                                        ))}
                                    </div>
                                    {/*
                                     * Who put it live (#283), what it came
                                     * from (T12), and any record (#199, T9),
                                     * each a line, so nothing depends on
                                     * hover.
                                     */}
                                    {copy.lines.map((line) => (
                                        <p
                                            key={line.text}
                                            className={cn(
                                                "text-xs",
                                                line.tone === "warning"
                                                    ? "mt-1 text-warning"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {line.releaseId ? (
                                                <Link
                                                    href={`/sites/${siteId}/releases/${line.releaseId}`}
                                                    className="underline-offset-2 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
                                                >
                                                    {line.text}
                                                </Link>
                                            ) : (
                                                line.text
                                            )}
                                        </p>
                                    ))}
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
                                    {p.isCurrent ||
                                    !canRestore ? null : confirming === p.id ? (
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="brand"
                                                onClick={() => onRestore(p.id)}
                                                busy={pending}
                                                busyLabel="Restoring…"
                                            >
                                                Restore as the draft
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
                                            {restoreLabel(p.publishedAt, zone)}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {confirming === p.id ? (
                                <p className="border-t pt-3 text-sm text-muted-foreground">
                                    {RESTORE_AS_DRAFT_LINE}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

/**
 * Go-lives that are scheduled and haven't happened yet (T12): each release,
 * when it goes live and who set it, linked to the release itself. A version
 * appears in the list below only once it has gone live.
 */
function ScheduledList({
    siteId,
    scheduled,
}: {
    siteId: string;
    scheduled: ScheduledGoLives;
}) {
    if (scheduled === null) return null;
    if (scheduled.state === "failed") {
        return (
            <FailedRead
                things="scheduled go-lives"
                className="rounded-lg border bg-muted px-4 py-3"
            />
        );
    }
    const upcoming = scheduled.releases.filter(
        (r) => r.status === "scheduled" && r.schedule,
    );
    if (upcoming.length === 0) return null;
    return (
        <section aria-label="Scheduled to go live" className="space-y-2">
            {upcoming.map((release) => {
                const status = releaseStatusCopy(release, scheduled.zone);
                return (
                    <Card key={release.id} className="wk-surface border-dashed">
                        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                            <div className="flex min-w-0 items-start gap-2.5">
                                <CalendarClock
                                    aria-hidden
                                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                                />
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium [overflow-wrap:anywhere]">
                                            {releaseTitle(release)}
                                        </span>
                                        <Badge variant="info">
                                            {status.label}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {status.line}
                                    </p>
                                </div>
                            </div>
                            <Button size="sm" variant="ghost" asChild>
                                <Link
                                    href={`/sites/${siteId}/releases/${release.id}`}
                                >
                                    View
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                );
            })}
        </section>
    );
}
