"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useBottomBarInset } from "@/lib/hooks/use-bottom-bar-inset";
import type { PublishWaiting } from "@/lib/sites/settings-page";

/**
 * The one place the settings say what waits for the next publish
 * (Website › Settings audit): a bar at the foot of the page while anything
 * does, from the API's own count (`publishWaiting`), and nothing while the
 * live site matches the draft. It replaces the "· Goes live with your next
 * publish" on every heading and the paragraph halfway down.
 *
 * "Review and publish" goes where publishing happens, the editor, with
 * its pre-publish check. Someone who can't publish reads the line only.
 */
export function PublishBar({
    waiting,
    editorHref,
    canPublish,
}: {
    waiting: PublishWaiting | null;
    editorHref: string;
    canPublish: boolean;
}) {
    const bar = useRef<HTMLDivElement>(null);
    useBottomBarInset(bar, waiting !== null);
    const room = useHeightOf(bar, waiting !== null);
    if (!waiting) return null;
    return (
        <>
            <div
                ref={bar}
                role="status"
                data-publish-bar
                className="sticky bottom-[var(--tab-bar-inset,0px)] z-20 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-card px-4 py-3 dark:bg-background sm:mx-0 sm:rounded-xl sm:border"
            >
                <p className="min-w-0 flex-1 basis-64 text-sm">
                    {waiting.line}
                </p>
                {canPublish ? (
                    <Button asChild size="sm" className="shrink-0">
                        <Link href={editorHref}>Review and publish</Link>
                    </Button>
                ) : null}
            </div>
            {/* Room under the bar as tall as the bar, so the last rows can
            scroll fully above it rather than end underneath. */}
            <div
                aria-hidden
                data-publish-bar-room
                className="!mt-0"
                style={{ height: room }}
            />
        </>
    );
}

/** An element's height, kept as it changes; 0 while it isn't drawn. */
function useHeightOf(
    ref: React.RefObject<HTMLElement | null>,
    enabled: boolean,
): number {
    const [height, setHeight] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el || !enabled) return;
        const measure = () => setHeight(el.offsetHeight);
        measure();
        const observer =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(measure);
        observer?.observe(el);
        return () => observer?.disconnect();
    }, [ref, enabled]);
    return enabled ? height : 0;
}
