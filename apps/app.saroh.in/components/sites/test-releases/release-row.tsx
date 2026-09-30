"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import {
    CalendarClock,
    CircleCheck,
    CircleDot,
    ExternalLink,
    Rocket,
    Trash2,
} from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReleaseLinks } from "@/components/sites/test-releases/release-links";
import type {
    GoLiveGate,
    ReleaseAbilities,
    TestRelease,
} from "@/lib/sites/test-releases";
import {
    goLiveGate,
    releaseStatusCopy,
    standingCopy,
} from "@/lib/sites/test-releases";
import {
    cancelScheduledGoLive,
    discardTestRelease,
    openTestRelease,
} from "@/lib/sites/test-releases-actions";

const BADGE = {
    success: "success",
    draft: "draft",
    neutral: "neutral",
    error: "error",
    info: "info",
} as const;

/**
 * One test release in the panel (DEC-071, T11): its name and number, who
 * made it and when, whether the draft has moved on since, where it stands
 * with its reviewers, its links, and what can be done with it — Open, Go
 * live…, Schedule…, Cancel schedule and Discard. A control this person
 * can't use says why beside it, never only on the press.
 */
export function ReleaseRow({
    siteId,
    release,
    zone,
    can,
    onChanged,
    onGoLive,
}: {
    siteId: string;
    release: TestRelease;
    zone: string;
    can: ReleaseAbilities;
    /** Something about it changed on the server: the list re-reads. */
    onChanged: () => void;
    onGoLive: (release: TestRelease, mode: "now" | "schedule") => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [discarding, setDiscarding] = useState(false);
    const status = releaseStatusCopy(release, zone);
    const standing = standingCopy(release.standing);
    const gate: GoLiveGate = goLiveGate(release, can);
    const current =
        release.status === "ready" || release.status === "scheduled";

    async function open() {
        // Opened before the request, so the browser treats it as the
        // press's own window rather than a pop-up.
        const tab = window.open("about:blank", "_blank");
        // The site it opens never gets a handle back on the editor.
        if (tab) tab.opener = null;
        setBusy("open");
        const res = await openTestRelease(siteId, release.id);
        setBusy(null);
        if (!res.ok || !res.data.url) {
            tab?.close();
            showError(
                res.ok
                    ? "This site has no test address, so the release can't be opened there."
                    : res.error,
            );
            return;
        }
        if (tab) tab.location.href = res.data.url;
        else window.location.assign(res.data.url);
    }

    async function cancelSchedule() {
        setBusy("cancel");
        const res = await cancelScheduledGoLive(siteId, release.id);
        setBusy(null);
        if (!res.ok) return showError(res.error);
        showSuccess(
            `Scheduled go-live cancelled. ${release.name} is ready again.`,
        );
        onChanged();
    }

    async function discard() {
        setBusy("discard");
        const res = await discardTestRelease(siteId, release.id);
        setBusy(null);
        if (!res.ok) return showError(res.error);
        showSuccess(`${release.name} discarded. Its links no longer open it.`);
        onChanged();
    }

    return (
        <li
            data-release-id={release.id}
            aria-label={release.name}
            className="grid gap-2.5 rounded-xl border bg-card p-3.5"
        >
            <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold [overflow-wrap:anywhere]">
                        {release.name}
                        <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                            #{release.number}
                        </span>
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-normal text-muted-foreground">
                        {status.line}
                    </p>
                </div>
                <Badge
                    variant={BADGE[status.tone]}
                    className="shrink-0 whitespace-nowrap"
                >
                    {status.label}
                </Badge>
            </div>

            {release.note ? (
                <p className="text-[12.5px] leading-normal [overflow-wrap:anywhere]">
                    {release.note}
                </p>
            ) : null}

            {current ? (
                <ul className="grid gap-1 text-[12.5px] leading-normal">
                    <li className="flex items-start gap-1.5">
                        {standing.approved ? (
                            <CircleCheck
                                aria-hidden
                                className="mt-0.5 size-3.5 shrink-0 text-success"
                            />
                        ) : (
                            <CircleDot
                                aria-hidden
                                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                            />
                        )}
                        <span>{standing.text}</span>
                    </li>
                    {release.draftChangedSince ? (
                        <li className="flex items-start gap-1.5 text-muted-foreground">
                            <span
                                aria-hidden
                                className="mx-[5px] mt-[7px] size-1 shrink-0 rounded-full bg-highlight"
                            />
                            Your draft has changed since
                        </li>
                    ) : null}
                </ul>
            ) : null}

            {current ? (
                <ReleaseLinks
                    siteId={siteId}
                    release={release}
                    zone={zone}
                    canShare={can.canUpdate}
                    onChanged={onChanged}
                />
            ) : null}

            {current ? (
                <div className="grid gap-1.5">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy !== null}
                            onClick={() => void open()}
                        >
                            <ExternalLink aria-hidden className="size-4" />
                            {busy === "open" ? "Opening…" : "Open"}
                        </Button>
                        {release.status === "scheduled" ? (
                            can.canPublish ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={busy !== null}
                                    onClick={() => void cancelSchedule()}
                                >
                                    <CalendarClock
                                        aria-hidden
                                        className="size-4"
                                    />
                                    {busy === "cancel"
                                        ? "Cancelling…"
                                        : "Cancel schedule"}
                                </Button>
                            ) : null
                        ) : (
                            <>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                        gate.kind === "override"
                                            ? "outline"
                                            : "default"
                                    }
                                    disabled={
                                        busy !== null || gate.kind === "blocked"
                                    }
                                    onClick={() => onGoLive(release, "now")}
                                >
                                    <Rocket aria-hidden className="size-4" />
                                    Go live…
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                        busy !== null || gate.kind === "blocked"
                                    }
                                    onClick={() =>
                                        onGoLive(release, "schedule")
                                    }
                                >
                                    <CalendarClock
                                        aria-hidden
                                        className="size-4"
                                    />
                                    Schedule…
                                </Button>
                            </>
                        )}
                        {can.canUpdate ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground"
                                disabled={busy !== null}
                                onClick={() => setDiscarding(true)}
                            >
                                <Trash2 aria-hidden className="size-4" />
                                Discard
                            </Button>
                        ) : null}
                    </div>
                    {/* Why Go live is off, or what it would leave behind. */}
                    {gate.kind !== "go" && release.status === "ready" ? (
                        <p
                            className={cn(
                                "text-[12px] leading-normal",
                                gate.kind === "override"
                                    ? "text-destructive-subtle-foreground"
                                    : "text-muted-foreground",
                            )}
                        >
                            {gate.kind === "override"
                                ? `${gate.why} As an owner you can still go live without approval; it's recorded.`
                                : gate.why}
                        </p>
                    ) : null}
                </div>
            ) : null}

            <ConfirmDialog
                open={discarding}
                onOpenChange={setDiscarding}
                title={`Discard ${release.name}?`}
                description="Its links stop working at once, and it can't be reviewed or put live. Your draft and the live site are left as they are. This cannot be undone."
                confirmLabel="Discard test release"
                onConfirm={() => void discard()}
            />
        </li>
    );
}
