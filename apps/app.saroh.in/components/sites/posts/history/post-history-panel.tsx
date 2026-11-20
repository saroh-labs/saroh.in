"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState, LoadingState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import type { PostRevisionRow } from "@/lib/content/service";
import { formatDateTime, formatTime } from "@/lib/format/datetime";
import { initials } from "@/lib/names";
import { readPostRevisions } from "@/lib/sites/post-revisions-read";

import type { PostEditorModel } from "../editor/post-model";
import { PostVersionSheet } from "./post-version-sheet";
import { groupVersions, revisionWhy } from "./version-words";

/**
 * Rail › History for a post (U15 stub, filled by U17 as `blogdesk/WXWHistory`
 * draws it). The rail shows the tab once this is true.
 */
export const POST_HISTORY_READY = true as boolean;

/**
 * A post's versions (`blogdesk/WXWHistory`): "Versions n", Today and
 * Earlier, each row who, when and why, the live one tagged Live. A row
 * opens the version beside now (`PostVersionSheet`) with Restore.
 *
 * Exported for the phone editor's More › Versions: it fills whatever
 * column or sheet it is put in; `model` is the editor's `PostEditorModel`.
 */
export function PostHistoryPanel({ model }: { model: PostEditorModel }) {
    const zone = useBusinessZone();
    const { siteId } = model.data;
    const postId = model.draft.postId;
    const [read, setRead] = useState<PostRevisionRow[] | "loading" | "failed">(
        "loading",
    );
    const [open, setOpen] = useState<PostRevisionRow | null>(null);

    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!postId) return;
        let gone = false;
        void readPostRevisions(siteId, postId)
            .catch(() => ({ ok: false as const }))
            .then((res) => {
                if (!gone) setRead(res.ok ? res.rows : "failed");
            });
        return () => {
            gone = true;
        };
    }, [siteId, postId, attempt]);
    const retry = () => {
        setRead("loading");
        setAttempt((n) => n + 1);
    };

    const rows = Array.isArray(read) ? read : [];
    // The copy visitors read now: the newest one published, while it's live.
    const liveId = model.draft.live
        ? rows.find((r) => r.reason === "published")?.id
        : undefined;

    return (
        <section
            aria-labelledby="post-versions-h"
            className="flex min-h-0 flex-1 flex-col"
        >
            <div className="flex h-12 shrink-0 items-center gap-2 px-4">
                <h2
                    id="post-versions-h"
                    className="text-[0.9375rem] font-semibold"
                >
                    Versions
                </h2>
                {rows.length > 0 ? (
                    <span className="text-[0.8125rem] text-muted-foreground">
                        {rows.length}
                    </span>
                ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {!postId ? (
                    <EmptyState
                        size="inline"
                        title="Versions start once the post is saved."
                    />
                ) : read === "loading" ? (
                    <LoadingState label="Getting versions" className="px-2" />
                ) : read === "failed" ? (
                    <FailedState
                        size="inline"
                        title="Couldn't load the versions"
                        onRetry={retry}
                    />
                ) : rows.length === 0 ? (
                    <EmptyState
                        size="inline"
                        title="No versions yet. One is kept each hour you write."
                    />
                ) : (
                    groupVersions(rows, zone).map((g) => (
                        <div key={g.day}>
                            <h3 className="px-2.5 pb-1 pt-3 text-xs font-semibold text-muted-foreground">
                                {g.day}
                            </h3>
                            <ul className="grid gap-0.5">
                                {g.rows.map((r) => (
                                    <li key={r.id}>
                                        <Button
                                            data-ph-mask=""
                                            type="button"
                                            variant="ghost"
                                            data-version={r.id}
                                            aria-current={
                                                open?.id === r.id
                                                    ? "true"
                                                    : undefined
                                            }
                                            onClick={() => setOpen(r)}
                                            className={cn(
                                                "h-auto w-full items-start justify-start gap-2.5 whitespace-normal rounded-[9px] px-2.5 py-2 text-left font-normal hover:bg-background",
                                                open?.id === r.id &&
                                                    "bg-background ring-1 ring-inset ring-border",
                                            )}
                                        >
                                            <span
                                                aria-hidden
                                                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[0.6875rem] font-semibold"
                                            >
                                                {initials(
                                                    r.savedBy?.name ?? "?",
                                                )}
                                            </span>
                                            <span className="min-w-0 flex-1 text-[0.8125rem]">
                                                <b className="block truncate font-semibold">
                                                    {r.savedBy?.name ??
                                                        "Someone"}
                                                </b>
                                                <small className="block text-xs text-muted-foreground">
                                                    {g.day === "Today"
                                                        ? formatTime(
                                                              r.createdAt,
                                                              zone,
                                                          )
                                                        : formatDateTime(
                                                              r.createdAt,
                                                              zone,
                                                          )}{" "}
                                                    · {revisionWhy(r)}
                                                </small>
                                            </span>
                                            {r.id === liveId ? (
                                                <Badge variant="success">
                                                    Live
                                                </Badge>
                                            ) : null}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))
                )}
            </div>
            <p className="shrink-0 border-t px-4 py-3 text-xs text-muted-foreground">
                We keep one copy an hour, for a year.
            </p>
            {open && postId ? (
                <PostVersionSheet
                    key={open.id}
                    model={model}
                    row={open}
                    live={open.id === liveId}
                    onClose={() => setOpen(null)}
                />
            ) : null}
        </section>
    );
}
