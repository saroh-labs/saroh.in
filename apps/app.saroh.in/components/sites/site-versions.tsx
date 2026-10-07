"use client";

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

import { useBusinessZone } from "@/components/shared/business-zone";
import { restorePublication } from "@/lib/sites/actions";
import { exactDate } from "@/lib/sites/format-date";
import type { RestoreGate, VersionBadgeTone } from "@/lib/sites/release-review";
import {
    releaseTitle,
    RESTORE_OVERRIDE_LINE,
    restoreGate,
    versionRowCopy,
} from "@/lib/sites/release-review";
import type { SitePublication } from "@/lib/sites/service";
import type { TestRelease } from "@/lib/sites/test-releases";
import { releaseStatusCopy } from "@/lib/sites/test-releases";

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
 * Restoring APPENDS a new publication carrying the chosen snapshot rather than
 * deleting the ones after it. Nothing is lost, and a restore can itself be
 * restored — which is what makes trying one safe.
 *
 * The confirm states what will change rather than asking "are you sure?": the
 * merchant is replacing what the public currently sees, and the date they are
 * replacing it with is the fact that decides it.
 *
 * Since DEC-071 (T12) each version says which test release it went live
 * from, an owner's override sits beside a bypass, and a go-live that is
 * scheduled but hasn't happened is listed above the versions.
 */
export function SiteVersions({
    siteId,
    publications,
    changesRequested,
    canRestore,
    needsApproval = false,
    canOverride = false,
    scheduled = null,
}: {
    siteId: string;
    publications: SitePublication[];
    /**
     * Whether this caller may put a version back (#275). Restoring is a
     * publish, so it needs `site:publish`; without it the control is absent
     * rather than disabled — a Restore that refuses on the press is where a
     * merchant currently learns the rule.
     */
    canRestore: boolean;
    /**
     * A reviewer's change request is outstanding (#279). Restoring still works,
     * because the rule is recorded, not prevented. But the confirm says so
     * before it happens, as the pre-publish check does for a publish.
     */
    changesRequested: boolean;
    /** "Publishing needs approval" is on for the site (DEC-071, R10). */
    needsApproval?: boolean;
    /** An owner who can publish: may restore past that setting (Q3). */
    canOverride?: boolean;
    scheduled?: ScheduledGoLives;
}) {
    const zone = useBusinessZone();
    const router = useRouter();
    const [confirming, setConfirming] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const gate = restoreGate({
        publishNeedsApproval: needsApproval,
        canOverride,
    });

    const upcoming = <ScheduledList siteId={siteId} scheduled={scheduled} />;

    if (publications.length === 0) {
        return (
            <div className="space-y-3">
                {upcoming}
                <EmptyState
                    icon={<History />}
                    title="Never published"
                    description="Once you publish this site, every version is kept here and you can put an earlier one back."
                />
            </div>
        );
    }

    const current = publications.find((p) => p.isCurrent);

    function onRestore(publicationId: string) {
        const override = gate.kind === "override";
        startTransition(async () => {
            const res = await restorePublication(
                siteId,
                publicationId,
                override,
            );
            if (!res.ok) {
                showError(res.error);
                // The setting was turned on since this page was read: the
                // refusal says so, and the page reads it again.
                if (res.code === "APPROVAL_REQUIRED") router.refresh();
                return;
            }
            setConfirming(null);
            router.refresh();
            showSuccess(
                override || res.data.bypassed
                    ? "That version is live again. Going live without approval is recorded in this list."
                    : "That version is live again.",
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
                                            {exactDate(when, zone)}
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
                                                className="whitespace-nowrap"
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
                                                variant={
                                                    gate.kind === "override"
                                                        ? "destructive"
                                                        : "brand"
                                                }
                                                disabled={pending}
                                                onClick={() => onRestore(p.id)}
                                            >
                                                {pending
                                                    ? "Restoring…"
                                                    : gate.kind ===
                                                            "override" ||
                                                        changesRequested
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
                                            disabled={gate.kind === "blocked"}
                                            onClick={() => setConfirming(p.id)}
                                        >
                                            Restore
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {!p.isCurrent &&
                            canRestore &&
                            gate.kind === "blocked" ? (
                                // Why Restore is off, beside it, not only on
                                // the press (frontend-design-system.md).
                                <p className="text-xs text-muted-foreground">
                                    {gate.why}
                                </p>
                            ) : null}

                            {confirming === p.id ? (
                                <RestoreConfirm
                                    gate={gate}
                                    current={current}
                                    changesRequested={changesRequested}
                                />
                            ) : null}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

function RestoreConfirm({
    gate,
    current,
    changesRequested,
}: {
    gate: RestoreGate;
    current: SitePublication | undefined;
    changesRequested: boolean;
}) {
    const zone = useBusinessZone();
    return (
        <div className="space-y-2 border-t pt-3">
            <p className="text-sm text-muted-foreground">
                This replaces what visitors see now
                {current
                    ? ` (published ${exactDate(current.publishedAt, zone)})`
                    : ""}
                . Nothing is deleted — this version is published again as a new
                entry, so you can undo it from this same list. Your unpublished
                draft is left alone.
                {changesRequested && gate.kind !== "override"
                    ? " A reviewer has asked for changes, so this goes live without their approval, and this list will record that it did."
                    : null}
            </p>
            {gate.kind === "override" ? (
                <p
                    role="note"
                    className="rounded-lg bg-destructive-subtle px-3.5 py-3 text-[12.5px] leading-normal text-destructive-subtle-foreground"
                >
                    {RESTORE_OVERRIDE_LINE}
                </p>
            ) : null}
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
            <p className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
                Couldn&apos;t check for scheduled go-lives. Reload to try again.
            </p>
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
                                        <Badge
                                            variant="info"
                                            className="whitespace-nowrap"
                                        >
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
