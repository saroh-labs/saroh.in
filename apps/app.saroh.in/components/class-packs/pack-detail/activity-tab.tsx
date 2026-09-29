"use client";

import { Button } from "@saroh/ui/button";
import { FailedState, PermissionDeniedState } from "@saroh/ui/data-state";
import { showError } from "@saroh/ui/toast";
import { useState, useTransition } from "react";

import { olderPackEvents } from "@/lib/class-packs/actions";
import {
    EARLIER_UNRECORDED,
    activityRow,
} from "@/lib/class-packs/pack-activity";
import type { PackKind } from "@/lib/class-packs/pack-cards";
import type {
    PackDetail,
    PackEvent,
    PackEventsPage,
} from "@/lib/class-packs/pack-detail-data";

/**
 * Pack Detail's Activity (E17, after the design): everything done to the
 * pack, newest first, with who did it — made, published, changed, sold,
 * extended, archived and back on sale. Older pages load on "Show older";
 * a pack older than its history says so at the end.
 */
export function ActivityTab({
    packId,
    first,
    denied,
    pack,
    kind,
    timeZone,
    onRetry,
}: {
    packId: string;
    /** The first page; null when it couldn't be read. */
    first: PackEventsPage | null;
    denied: boolean;
    pack: Pick<PackDetail, "currency">;
    kind: PackKind;
    timeZone: string;
    onRetry: () => void;
}) {
    const [more, setMore] = useState<{
        events: PackEvent[];
        cursor: string | null;
    } | null>(null);
    const [loading, start] = useTransition();

    if (denied) {
        return (
            <PermissionDeniedState
                title="You can't see this pack's activity"
                description="Your role doesn't reach the pack's history."
                note="An owner or admin can change what your role reaches in Team."
            />
        );
    }
    if (!first) {
        return (
            <FailedState
                title="Activity could not be loaded"
                description="This tab couldn't read the pack's history. Nothing has changed — try again."
                action={
                    <Button variant="outline" onClick={onRetry}>
                        Try again
                    </Button>
                }
            />
        );
    }

    const events = [...first.events, ...(more?.events ?? [])];
    const cursor = more ? more.cursor : first.nextCursor;
    const rows = events.map((e) => activityRow(e, pack, kind, timeZone));

    function older() {
        if (!cursor) return;
        start(async () => {
            const res = await olderPackEvents(packId, cursor);
            if (res.state !== "ok") {
                showError(
                    "Couldn't load older activity. Nothing has changed — try again.",
                );
                return;
            }
            setMore((m) => ({
                events: [...(m?.events ?? []), ...res.data.events],
                cursor: res.data.nextCursor,
            }));
        });
    }

    return (
        <div className="rounded-[12px] border border-border bg-card px-[18px] pb-2 pt-1">
            {rows.length === 0 ? (
                <p className="m-0 py-2 text-[13px] text-muted-foreground">
                    Nothing recorded yet.
                </p>
            ) : (
                <ul aria-label="Activity" className="m-0 grid list-none p-0">
                    {rows.map((a) => (
                        <li
                            key={a.id}
                            className="flex flex-wrap gap-3 border-t border-border/70 py-2 text-[13px]"
                        >
                            <span className="flex-[0_0_56px] text-muted-foreground">
                                {a.when}
                            </span>
                            <span className="min-w-0 flex-[1_1_240px] text-pretty">
                                {a.text}
                            </span>
                            {a.who ? (
                                <span className="text-muted-foreground">
                                    {a.who}
                                </span>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
            {cursor ? (
                <div className="border-t border-border/70 pt-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={older}
                        disabled={loading}
                    >
                        {loading ? "Loading…" : "Show older"}
                    </Button>
                </div>
            ) : first.earlierUnrecorded ? (
                <p className="m-0 border-t border-border/70 py-2 text-[12.5px] text-muted-foreground">
                    {EARLIER_UNRECORDED}
                </p>
            ) : null}
        </div>
    );
}
