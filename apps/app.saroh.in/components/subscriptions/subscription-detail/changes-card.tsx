"use client";

import { FailedRead } from "@/components/shared/failed-read";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { useState } from "react";

import { loadSubscriptionEvents } from "@/lib/subscriptions/actions";
import { changeRows, FIRST_CHANGES } from "@/lib/subscriptions/events";
import type {
    Optional,
    Subscription,
    SubscriptionEvent,
    SubscriptionEventsPage,
} from "@/lib/subscriptions/service";
import { EmptyState } from "@saroh/ui/data-state";

const CARD = "rounded-xl border border-border bg-card";
const TITLE = "font-display text-[15px] font-semibold tracking-[-0.02em]";
/**
 * Changes: what was done to the subscription and by whom, from its log
 * (D9), newest first — the latest ten, then "See all", which reads older
 * pages as it needs them. A subscription older than the log says so.
 */
export function ChangesCard({
    page,
    sub,
    viewerId,
    now,
}: {
    page: Optional<SubscriptionEventsPage>;
    sub: Pick<Subscription, "id" | "timezone" | "contact">;
    viewerId: string | null;
    now: Date;
}) {
    const first = page.state === "ok" ? page.data : null;
    const [events, setEvents] = useState<SubscriptionEvent[]>(
        first?.events ?? [],
    );
    const [cursor, setCursor] = useState(first?.nextCursor ?? null);
    const [everything, setEverything] = useState(false);
    const [loading, setLoading] = useState(false);
    // The card keeps the pages it has read. A first page that failed and
    // then arrived (Try again reads the page again) starts it from that
    // page, or the card would draw "ok" with nothing in it.
    const [arrived, setArrived] = useState(first !== null);
    if (first && !arrived) {
        setArrived(true);
        setEvents(first.events);
        setCursor(first.nextCursor);
    }

    const all = changeRows(events, sub, viewerId, now);
    const rows = everything ? all : all.slice(0, FIRST_CHANGES);
    const more = !everything && (all.length > rows.length || cursor !== null);

    async function older() {
        if (!cursor) return;
        setLoading(true);
        const next = await loadSubscriptionEvents(sub.id, cursor).catch(
            () => null,
        );
        setLoading(false);
        if (next?.state !== "ok") {
            showError("The older changes couldn't be loaded. Try again.");
            return;
        }
        setEvents((had) => [...had, ...next.data.events]);
        setCursor(next.data.nextCursor);
    }

    return (
        <section
            aria-labelledby="changes-title"
            className={cn(CARD, "px-4 py-[13px]")}
        >
            <h2 id="changes-title" className={cn(TITLE, "mb-2")}>
                Changes
            </h2>
            {page.state === "failed" ? (
                <FailedRead
                    things="the changes"
                    reassurance="Everything else on this page is up to date."
                />
            ) : page.state !== "ok" ? (
                <p role="note" className="text-[12.5px] text-muted-foreground">
                    Your role can&apos;t see what changed on this subscription.
                </p>
            ) : (
                <>
                    {rows.map((c) => (
                        <div key={c.id} className="py-1.5">
                            <div className="text-[13px] font-semibold">
                                {c.what}
                            </div>
                            <div className="text-[12px] text-muted-foreground">
                                {c.when}
                            </div>
                        </div>
                    ))}
                    {more ? (
                        <Button
                            variant="link"
                            size="inline"
                            type="button"
                            onClick={() => setEverything(true)}
                            className="mt-1.5"
                        >
                            See all
                        </Button>
                    ) : null}
                    {everything && cursor ? (
                        <Button
                            variant="link"
                            size="inline"
                            type="button"
                            onClick={() => void older()}
                            className="mt-1.5"
                            busy={loading}
                            busyLabel="Loading…"
                        >
                            Show older changes
                        </Button>
                    ) : null}
                    {/* Said once the oldest recorded change is on show. */}
                    {first?.earlierUnrecorded && !more && !cursor ? (
                        <p className="mt-1.5 text-[12px] text-muted-foreground">
                            Earlier changes weren&apos;t recorded.
                        </p>
                    ) : rows.length === 0 ? (
                        <EmptyState size="inline" title="No changes yet." />
                    ) : null}
                </>
            )}
        </section>
    );
}
