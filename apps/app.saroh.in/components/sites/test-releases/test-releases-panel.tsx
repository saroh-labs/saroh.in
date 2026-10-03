"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { Plus } from "lucide-react";
import { useState } from "react";

import type { EditorTestReleases } from "@/components/sites/editor/use-test-releases";
import { ReleaseRow } from "@/components/sites/test-releases/release-row";
import { releaseStatusCopy } from "@/lib/sites/test-releases";

/** How many earlier releases show before "Show all". */
const EARLIER_SHOWN = 3;

/**
 * The editor's Test releases panel (DEC-071, T11), in a sheet beside the
 * page. The releases that can still go live come first, each with its
 * links, review standing and actions; the ones that went live or were
 * discarded follow, as history. A read that failed says so and offers a
 * retry; it never reads as "none yet".
 */
export function TestReleasesPanel({
    siteId,
    releases: state,
}: {
    siteId: string;
    releases: EditorTestReleases;
}) {
    const [retrying, setRetrying] = useState(false);
    const [allEarlier, setAllEarlier] = useState(false);
    const { read, zone, releases, abilities } = state;
    const current = releases.filter(
        (r) => r.status === "ready" || r.status === "scheduled",
    );
    const earlier = releases.filter(
        (r) => r.status === "live" || r.status === "discarded",
    );
    const shownEarlier = allEarlier ? earlier : earlier.slice(0, EARLIER_SHOWN);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid shrink-0 gap-2 border-b px-4 pb-3">
                <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                    Test releases
                </h2>
                <p className="text-[12.5px] leading-normal text-muted-foreground">
                    A frozen copy of your site on its own test address, for
                    people with the link. Nothing there takes a real order,
                    booking or payment. Go live with it when it&apos;s right.
                </p>
                {abilities.canUpdate ? (
                    <Button
                        type="button"
                        size="sm"
                        // Outline: a release's Go live is the panel's one
                        // filled action.
                        variant="outline"
                        className="w-fit"
                        onClick={() => state.setMaking(true)}
                    >
                        <Plus aria-hidden className="size-4" />
                        Make a test release
                    </Button>
                ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {read.state === "failed" ? (
                    <FailedState
                        title="Test releases couldn't be loaded"
                        description="Nothing has changed. Try again in a moment."
                        action={
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={retrying}
                                onClick={() => {
                                    setRetrying(true);
                                    void state
                                        .refresh()
                                        .finally(() => setRetrying(false));
                                }}
                            >
                                {retrying ? "Trying…" : "Try again"}
                            </Button>
                        }
                    />
                ) : releases.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-[12.5px] leading-normal text-muted-foreground">
                        No test releases yet.
                        {abilities.canUpdate
                            ? " Make one to share this version before it goes live."
                            : " Someone who edits the site can make one."}
                    </p>
                ) : (
                    <div className="grid gap-5">
                        {current.length > 0 ? (
                            <ul
                                aria-label="Ready to go live"
                                className="grid gap-3"
                            >
                                {current.map((release) => (
                                    <ReleaseRow
                                        key={release.id}
                                        siteId={siteId}
                                        release={release}
                                        zone={zone}
                                        can={abilities}
                                        onChanged={() => void state.refresh()}
                                        onGoLive={(r, mode) =>
                                            state.setGoLive({
                                                release: r,
                                                mode,
                                            })
                                        }
                                    />
                                ))}
                            </ul>
                        ) : null}
                        {earlier.length > 0 ? (
                            <section
                                aria-label="Earlier"
                                className="grid gap-2"
                            >
                                <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                    Earlier
                                </h3>
                                <ul className="grid divide-y rounded-xl border">
                                    {shownEarlier.map((release) => {
                                        const status = releaseStatusCopy(
                                            release,
                                            zone,
                                        );
                                        return (
                                            <li
                                                key={release.id}
                                                className="grid gap-0.5 px-3.5 py-2.5"
                                            >
                                                <p className="text-[13px] font-medium [overflow-wrap:anywhere]">
                                                    {release.name}
                                                    <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                                                        #{release.number} ·{" "}
                                                        {status.label}
                                                    </span>
                                                </p>
                                                <p className="text-[12px] text-muted-foreground">
                                                    {status.line}
                                                </p>
                                            </li>
                                        );
                                    })}
                                </ul>
                                {earlier.length > EARLIER_SHOWN ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="w-fit"
                                        onClick={() => setAllEarlier((v) => !v)}
                                    >
                                        {allEarlier
                                            ? "Show fewer"
                                            : `Show all ${earlier.length}`}
                                    </Button>
                                ) : null}
                            </section>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
