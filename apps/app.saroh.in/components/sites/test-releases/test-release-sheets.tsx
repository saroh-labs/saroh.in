"use client";

import { showSuccess } from "@saroh/ui/toast";
import { useRef } from "react";

import type { TestReleaseActions } from "@/components/sites/editor/top-bar-actions";
import type { EditorTestReleases } from "@/components/sites/editor/use-test-releases";
import { GoLiveSheet } from "@/components/sites/test-releases/go-live-sheet";
import { MakeTestReleaseSheet } from "@/components/sites/test-releases/make-test-release-sheet";
import type { SiteChangeKind } from "@/lib/sites/pending";
import { goLiveGate, wentLiveToast, whenIn } from "@/lib/sites/test-releases";

/**
 * The Test release split in the top bar (T11): Make (with `site:update`)
 * and the list. Undefined while test releases are off, so nothing is drawn.
 */
export function testReleaseActions(
    releases: EditorTestReleases,
): TestReleaseActions | undefined {
    if (!releases.available) return undefined;
    return {
        onMake: releases.abilities.canUpdate
            ? () => releases.setMaking(true)
            : undefined,
        onOpenList: () => releases.setPanelOpen(true),
        count: releases.releases.filter(
            (r) => r.status === "ready" || r.status === "scheduled",
        ).length,
    };
}

/**
 * The editor's two test-release sheets (DEC-071, T11): Make, and Go live
 * (now or scheduled). Made releases open the panel, where their links and
 * actions live; a go-live tells the editor the live site moved, so its
 * pill and counts follow.
 */
export function TestReleaseSheets({
    siteId,
    releases,
    unsaved,
    recordWentLive,
}: {
    siteId: string;
    releases: EditorTestReleases;
    unsaved: boolean;
    recordWentLive: (
        pending: {
            sections: number | null;
            site: SiteChangeKind[] | null;
        } | null,
    ) => Promise<void>;
}) {
    // A release made in this opening of the sheet: closing shows it in place.
    const justMade = useRef(false);
    if (!releases.available) return null;
    const target = releases.goLive;
    const highest = releases.releases.reduce(
        (n, r) => Math.max(n, r.number),
        0,
    );
    return (
        <>
            <MakeTestReleaseSheet
                siteId={siteId}
                open={releases.making}
                onOpenChange={(open) => {
                    releases.setMaking(open);
                    if (!open && justMade.current) {
                        justMade.current = false;
                        releases.setPanelOpen(true);
                    }
                }}
                unsaved={unsaved}
                nextNumber={highest + 1}
                onMade={() => {
                    justMade.current = true;
                    void releases.refresh();
                }}
            />
            <GoLiveSheet
                siteId={siteId}
                target={target}
                gate={
                    target
                        ? goLiveGate(target.release, releases.abilities)
                        : null
                }
                zone={releases.zone}
                livePublishedAt={releases.livePublishedAt}
                onClose={() => releases.setGoLive(null)}
                onWentLive={(result) => {
                    releases.setGoLive(null);
                    releases.setLivePublishedAt(result.publishedAt);
                    showSuccess(wentLiveToast(result, releases.zone));
                    void releases.refresh();
                    void releases.readLive().then(recordWentLive);
                }}
                onScheduled={(release) => {
                    releases.setGoLive(null);
                    const at = release.schedule
                        ? whenIn(
                              release.schedule.goLiveAt,
                              release.schedule.zone ?? releases.zone,
                          )
                        : "then";
                    showSuccess(
                        `${release.name} goes live ${at}. You can cancel it until then.`,
                    );
                    void releases.refresh();
                }}
            />
        </>
    );
}
