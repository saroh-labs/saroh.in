"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { ChevronDown } from "lucide-react";
import { useRef } from "react";

import { useBottomBarInset } from "@/lib/hooks/use-bottom-bar-inset";

import type { ServiceDraft } from "@/lib/services/service-editor";
import type { Bookers } from "@/lib/services/service-form";
import {
    detailsLine,
    freeTimeOf,
    PAUSE_LINE,
    summaryLine,
} from "@/lib/services/service-form";
import type { DetailRow, PanelKey } from "@/lib/services/service-panels";

import { DESK, DetailsList, PHONE } from "./service-rows";
import { WhoCanBookCard } from "./who-can-book";

/**
 * New service's right-hand column at a desk (BKDServiceNew), under the
 * questions on a phone (BKMServiceNew, BKMServiceNewStep2): the live line,
 * then "Who can book it" and More details. On a phone More details is a
 * row that opens them in the questions' place, with the questions summed
 * up in a card whose Edit goes back to them.
 */
export function NewServiceSide({
    draft,
    names,
    currency,
    live,
    moreOpen,
    setMoreOpen,
    bookers,
    onBookers,
    rows,
    panelProblem,
    openPanel,
}: {
    draft: ServiceDraft;
    /** Who does it, by the names they are called. */
    names: readonly string[];
    currency: string;
    live: { ready: boolean; text: string };
    moreOpen: boolean;
    setMoreOpen: (open: boolean) => void;
    bookers: Bookers;
    onBookers: (next: Bookers) => void;
    rows: readonly DetailRow[];
    panelProblem: (panel: PanelKey) => string | null;
    openPanel: (panel: PanelKey) => void;
}) {
    return (
        <div className="grid min-w-0 gap-3.5">
            {moreOpen ? (
                <div
                    className={cn(
                        "flex items-center gap-3 rounded-[12px] border border-border bg-card px-3.5 py-3",
                        PHONE,
                    )}
                >
                    <span className="min-w-0 flex-1" data-ph-mask="">
                        <span className="block text-[14px] font-semibold">
                            {draft.name.trim() || "New service"}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                            {summaryLine(draft, names, currency)}
                        </span>
                    </span>
                    <Button
                        type="button"
                        variant="link"
                        size="inline"
                        onClick={() => setMoreOpen(false)}
                    >
                        Edit
                    </Button>
                </div>
            ) : null}
            <Notice
                tone={live.ready ? "success" : "neutral"}
                role="status"
                data-live={live.ready ? "ready" : "not-yet"}
                className="text-[13.5px]"
            >
                <span data-ph-mask="">{live.text}</span>
            </Notice>

            <Button
                type="button"
                variant="ghost"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(!moreOpen)}
                className={cn(
                    "h-auto min-h-[60px] justify-between gap-3 whitespace-normal rounded-none border-y border-border px-0 py-2 text-left hover:bg-transparent",
                    PHONE,
                )}
            >
                <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold">
                        More details
                    </span>
                    <span className="mt-0.5 block text-[12.5px] font-normal text-muted-foreground">
                        Who can book it, description, break, place, own hours,
                        deposit, GST
                    </span>
                </span>
                <ChevronDown
                    aria-hidden
                    className={cn(
                        "size-4 transition-transform",
                        moreOpen && "rotate-180",
                    )}
                />
            </Button>

            <div
                className={cn(
                    "grid min-w-0 gap-3.5",
                    !moreOpen && "max-[759px]:hidden",
                )}
            >
                <WhoCanBookCard
                    bookers={bookers}
                    onChange={onBookers}
                    line={PAUSE_LINE}
                    freeTime={
                        names.length ? freeTimeOf(draft.kind, names) : null
                    }
                />
                <section
                    aria-labelledby="more-details"
                    className="min-w-0 rounded-[12px] border border-border bg-card px-[18px] pb-2.5 pt-1.5"
                >
                    <div className="py-2.5">
                        <h2
                            id="more-details"
                            data-ph-unmask=""
                            className="font-display text-[16px] font-semibold tracking-[-0.01em]"
                        >
                            More details
                        </h2>
                        <p
                            className="mt-0.5 text-[12.5px] leading-[1.5] text-muted-foreground"
                            data-ph-unmask=""
                        >
                            All optional. {detailsLine(bookers)}
                        </p>
                    </div>
                    <DetailsList
                        rows={rows}
                        problemOf={panelProblem}
                        onOpen={openPanel}
                    />
                </section>
            </div>
        </div>
    );
}

/**
 * The sticky foot (BKDServiceNew, BKMServiceNew): at a desk what is being
 * added, summed up, then Discard and Add service; on a phone Discard only
 * once something is typed, and Add service the wider. It sits over the
 * tab bar, and toasts rise above it.
 */
export function NewServiceFoot({
    summary,
    dirty,
    saving,
    label,
    onDiscard,
}: {
    summary: string;
    dirty: boolean;
    saving: boolean;
    /** "Add service", or "Save" once it was added and its hours weren't. */
    label: string;
    onDiscard: () => void;
}) {
    const foot = useRef<HTMLDivElement>(null);
    useBottomBarInset(foot);
    return (
        <div
            ref={foot}
            data-service-foot=""
            className="sticky bottom-[var(--tab-bar-inset)] z-10 -mx-4 flex items-center gap-2.5 border-t border-border bg-card px-4 py-3 dark:bg-background sm:-mx-[26px] sm:px-[26px]"
        >
            <span
                className={cn(
                    "min-w-0 flex-1 truncate text-[13px] text-muted-foreground",
                    DESK,
                )}
                data-ph-mask=""
            >
                {summary}
            </span>
            {dirty ? (
                <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={onDiscard}
                    className="max-[759px]:flex-1"
                >
                    Discard
                </Button>
            ) : (
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onDiscard}
                    className={DESK}
                >
                    Discard
                </Button>
            )}
            <Button
                type="submit"
                busy={saving}
                busyLabel="Adding…"
                className="max-[759px]:flex-[2]"
            >
                {label}
            </Button>
        </div>
    );
}
