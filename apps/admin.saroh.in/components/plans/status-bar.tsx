"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { formatDate } from "@/lib/format";
import { previewPricingAction } from "@/lib/pricing-actions";
import {
    changeCount,
    draftSummary,
    namesList,
    otherEditors,
    publishedByName,
    upcomingVersions,
} from "@/lib/pricing-draft";

import { useDraft } from "./draft-store";
import { usePlans } from "./plans-context";
import { usePlansNav } from "./plans-tabs";
import { useFlash } from "./toast";

/**
 * The bar above the tabs (plans catalogue U6), in the design's two states:
 * Live (version, who published it, anything scheduled), or the amber Draft
 * banner (what it changes and does, Preview, Discard, Review & publish).
 * Below it, a refused save says who saved since, with Reload.
 */
export function StatusBar() {
    const { hasDraft } = useDraft();
    return (
        <div className="grid gap-3">
            {hasDraft ? <DraftBanner /> : <LiveBar />}
            <ConflictNotice />
        </div>
    );
}

const BAR_BUTTON = "h-[34px] rounded-[9px] px-3.5 text-[13px]";

function LiveBar() {
    const { pricing, access } = usePlans();
    const { live } = useDraft();
    const next = upcomingVersions(pricing).at(0);

    return (
        <section
            aria-label="Pricing status"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-border bg-card px-4 py-3 text-[13.5px]"
        >
            {live ? (
                <>
                    <Badge
                        variant="success"
                        className="px-2 text-[11px] font-semibold uppercase tracking-[0.04em]"
                    >
                        Live
                    </Badge>
                    <span className="font-semibold">
                        Version {live.version}
                    </span>
                    <span className="text-muted-foreground">
                        Published {formatDate(live.goLiveAt)} by{" "}
                        {publishedByName(live)}
                    </span>
                </>
            ) : (
                <span className="font-semibold">Nothing is published yet</span>
            )}
            {next && (
                <Badge
                    variant={next.status === "waiting" ? "warning" : "info"}
                    className="px-2 text-[11px] font-semibold"
                >
                    {next.status === "waiting"
                        ? `Version ${next.version} is waiting for billing`
                        : `Version ${next.version} goes live ${formatDate(next.goLiveAt)}`}
                </Badge>
            )}
            <span className="text-[12.5px] text-muted-foreground sm:ml-auto">
                {access.canEdit
                    ? "Change anything below to start a draft. Coupons are the exception: they work as soon as you save them."
                    : "You can see pricing here but not change it."}
            </span>
        </section>
    );
}

function DraftBanner() {
    const { access, siteUrl, me } = usePlans();
    const draft = useDraft();
    const { setTab } = usePlansNav();
    const flash = useFlash();
    const [previewing, setPreviewing] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const others = otherEditors(draft.editors, me);
    const count = draft.check.valid
        ? `Draft · ${changeCount(draft.check.changes.length)}`
        : "Draft · not ready to publish";

    async function preview() {
        setPreviewError(null);
        // Opened now, inside the click, so no popup blocker stops it; it is
        // pointed at the preview once the draft is saved and a link minted.
        const tab = window.open("about:blank", "_blank");
        setPreviewing(true);
        try {
            const { saved, revision } = await draft.flush();
            if (!saved) {
                tab?.close();
                setPreviewError(
                    "The draft has to be saved before it can be previewed.",
                );
                return;
            }
            const r = await previewPricingAction(revision);
            if (!r.ok) {
                tab?.close();
                setPreviewError(r.error);
                return;
            }
            const url = `${siteUrl}/pricing/preview?token=${encodeURIComponent(r.data.token)}`;
            if (tab) {
                tab.opener = null;
                tab.location.href = url;
            } else {
                window.location.assign(url);
            }
        } finally {
            setPreviewing(false);
        }
    }

    return (
        <section
            aria-label="Draft"
            className="flex flex-wrap items-center gap-x-[18px] gap-y-3 rounded-[12px] border border-highlight/50 bg-highlight-subtle px-4 py-3.5 text-[13.5px]"
        >
            <div className="grid min-w-0 flex-[1_1_340px] gap-1">
                <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="font-semibold text-highlight-subtle-foreground">
                        {count}
                    </span>
                    <SaveState />
                </p>
                <p className="text-[12.5px] leading-normal text-muted-foreground">
                    {draftSummary({ check: draft.check, impact: draft.impact })}
                </p>
                {previewError && (
                    <p role="alert" className="text-[12.5px] text-destructive">
                        {previewError}
                    </p>
                )}
            </div>
            <Button
                type="button"
                variant="outline"
                className={BAR_BUTTON}
                onClick={() => void preview()}
                disabled={previewing}
            >
                {previewing ? "Opening…" : "Preview pricing page"}
                <ArrowUpRight aria-hidden className="size-3.5" />
                <span className="sr-only"> (opens in a new tab)</span>
            </Button>
            {access.canEdit && (
                <OperatorDialog
                    trigger="Discard draft"
                    title="Discard the draft?"
                    effect={
                        others.length > 0 ? (
                            <p>
                                {namesList(others)}{" "}
                                {others.length === 1 ? "has" : "have"} edited
                                this draft too. Discarding throws away their
                                changes as well as yours. The live pricing stays
                                as it is.
                            </p>
                        ) : (
                            <p>
                                Every change in the draft is thrown away. The
                                live pricing stays as it is.
                            </p>
                        )
                    }
                    submitLabel="Discard draft"
                    destructive
                    reasonRequired={false}
                    onSubmit={async ({ idempotencyKey }) => {
                        const r = await draft.discard({ idempotencyKey });
                        if (r.ok) flash("Draft discarded");
                        return r;
                    }}
                />
            )}
            {access.canEdit && (
                <Button
                    type="button"
                    variant="highlight"
                    className={BAR_BUTTON}
                    onClick={() => setTab("publish")}
                >
                    Review &amp; publish
                </Button>
            )}
        </section>
    );
}

/** Saving, saved, or not saved with a way to try again. */
function SaveState() {
    const { save, saveError, retry } = useDraft();
    if (save === "saving") {
        return (
            <span className="text-[12px] text-muted-foreground">Saving…</span>
        );
    }
    if (save === "saved") {
        return <span className="text-[12px] text-muted-foreground">Saved</span>;
    }
    if (save === "failed") {
        return (
            <span role="alert" className="text-[12px] text-destructive">
                {saveError ?? "The draft could not be saved."}{" "}
                <button
                    type="button"
                    onClick={retry}
                    className="cursor-pointer font-semibold underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground"
                >
                    Try again
                </button>
            </span>
        );
    }
    return null;
}

function ConflictNotice() {
    const { conflict, saveError, reload } = useDraft();
    if (!conflict) return null;
    return (
        <div
            role="alert"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-warning/30 bg-warning-subtle px-4 py-3 text-[13px] text-warning-subtle-foreground"
        >
            <p className="min-w-0 flex-[1_1_280px]">{saveError}</p>
            <Button
                type="button"
                variant="outline"
                className={BAR_BUTTON}
                onClick={reload}
            >
                Reload draft
            </Button>
        </div>
    );
}
