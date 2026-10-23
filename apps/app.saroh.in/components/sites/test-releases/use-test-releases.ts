import { useCallback, useRef, useState } from "react";

import type { SiteChangeKind } from "@/lib/sites/pending";
import type {
    ReleaseAbilities,
    TestRelease,
    TestReleasesRead,
} from "@/lib/sites/test-releases";
import { scheduledReadout, scheduledRelease } from "@/lib/sites/test-releases";
import {
    listTestReleases,
    readSiteLiveState,
} from "@/lib/sites/test-releases-actions";

/** Which go-live sheet is open, and for which release. */
export interface GoLiveTarget {
    release: TestRelease;
    mode: "now" | "schedule";
}

/**
 * The editor's test releases (DEC-071, T11): the list the API holds, which
 * sheet is open, and when the live site last changed, so Go live can say what
 * it replaces. Everything is hidden while the read is `off`: the flag is off
 * for the business (KTD-16).
 */
export function useTestReleases({
    siteId,
    initialRead,
    initialLivePublishedAt,
}: {
    siteId: string;
    initialRead: TestReleasesRead;
    initialLivePublishedAt: string | null;
}) {
    const [read, setRead] = useState<TestReleasesRead>(initialRead);
    const [panelOpen, setPanelOpen] = useState(false);
    const [making, setMaking] = useState(false);
    const [goLive, setGoLive] = useState<GoLiveTarget | null>(null);
    const [livePublishedAt, setLivePublishedAt] = useState<string | null>(
        initialLivePublishedAt,
    );
    // Only the newest re-read may write, as the flags' re-read has it.
    const request = useRef(0);

    const refresh = useCallback(async () => {
        const mine = ++request.current;
        const next = await listTestReleases(siteId);
        if (mine !== request.current) return;
        // A failed re-read keeps what is on screen rather than blanking it,
        // unless nothing was ever read.
        setRead((prev) =>
            next.state === "failed" && prev.state === "on" ? prev : next,
        );
    }, [siteId]);

    /**
     * What the live site is now: after a go-live or a publish, the pending
     * counts and when it last went live. Null when it couldn't be read.
     */
    const readLive = useCallback(async (): Promise<{
        sections: number | null;
        site: SiteChangeKind[] | null;
    } | null> => {
        const live = await readSiteLiveState(siteId);
        if (live === null) return null;
        setLivePublishedAt(live.livePublishedAt);
        return {
            sections: live.pendingSectionChanges,
            site: live.pendingSiteChanges,
        };
    }, [siteId]);

    const available = read.state !== "off";
    const list = read.state === "on" ? read.list : null;
    const zone = list?.zone ?? "Asia/Kolkata";
    const releases = list?.releases ?? [];

    return {
        available,
        read,
        list,
        zone,
        releases,
        refresh,
        readLive,
        livePublishedAt,
        setLivePublishedAt,
        /** "Going live Fri 6:00pm · Diwali menu", for the top bar. */
        scheduled: scheduledReadout(releases, zone),
        scheduledRelease: scheduledRelease(releases),
        panelOpen,
        setPanelOpen,
        making,
        setMaking,
        goLive,
        setGoLive,
    };
}

/**
 * The releases as the panel and sheets read them: the hook's state, and what
 * this person may do, which the editor works out beside the publish state
 * (the approval setting can turn on while it is open).
 */
export type EditorTestReleases = ReturnType<typeof useTestReleases> & {
    abilities: ReleaseAbilities;
};
