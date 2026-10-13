"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { formatDate, formatDateTime } from "@/lib/format";
import { previewPricingAction } from "@/lib/pricing-actions";
import {
    changeCount,
    draftSummary,
    namesList,
    otherEditors,
    outdatedMessage,
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
 * Below it, a refused save says who saved since, with Reload; and a draft
 * a newer version has overtaken says so, and what it had changed.
 */
export function StatusBar() {
    const { hasDraft, outdated, conflict } = useDraft();
    // Someone else's save is the news until it is reloaded; otherwise a
    // newer version is, as soon as the page has read it.
    const overtaken =
        outdated !== null &&
        (conflict === null || conflict.newestVersion !== undefined);
    return (
        <div className="grid gap-3">
            {hasDraft ? <DraftBanner /> : <LiveBar />}
            {overtaken ? <OutdatedNotice /> : <ConflictNotice />}
        </div>
    );
}

const BAR_BUTTON = "h-[34px] rounded-[9px] px-3.5 text-[13px]";

function LiveBar() {
    const { pricing, access } = usePlans();
    const { live, base } = useDraft();
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
            {base && base.version !== live?.version && (
                <span className="text-[12.5px] text-muted-foreground">
                    What you see and edit below is version {base.version}.
                </span>
            )}
            <span className="text-[12.5px] text-muted-foreground sm:ml-auto">
                {access.canEdit
                    ? "Edits make a shared draft. Businesses see nothing until you publish. Coupons apply as soon as you save them."
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
    const first = draft.live === null;
    const count = !draft.check.valid
        ? "Draft · not ready to publish"
        : first
          ? "Draft · first version"
          : `Draft · ${changeCount(draft.check.changes.length)}`;

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
                    {access.canEdit && <SaveDraftButton />}
                </p>
                <p className="text-[12.5px] leading-normal text-muted-foreground">
                    {draftSummary({
                        check: draft.check,
                        impact: draft.impact,
                        firstVersion: first,
                    })}
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

/**
 * "Save draft": the draft autosaves, and this saves it now, so nobody has
 * to trust a pause. It reads "Saved" (and can't be pressed) when what is on
 * screen is saved, "Saving…" while a save is on its way, and "Save draft"
 * when something isn't saved yet. A save that fails or is refused says so
 * in `SaveState` and the notices below, not here.
 */
function SaveDraftButton() {
    const { save, saving, revision, flush, retry } = useDraft();
    const unsaved = save === "saving" || save === "failed" || revision === 0;
    const label = saving ? "Saving…" : unsaved ? "Save draft" : "Saved";
    return (
        <Button
            type="button"
            variant="outline"
            className="h-[26px] rounded-[7px] px-2.5 text-[12px] coarse:h-11"
            disabled={saving || !unsaved || save === "conflict"}
            aria-busy={saving}
            onClick={() => (save === "failed" ? retry() : void flush())}
        >
            {label}
        </Button>
    );
}

/** Saving, when it was saved, or not saved with a way to try again. */
function SaveState() {
    const { save, saving, savedAt, saveError, retry } = useDraft();
    if (save === "saving") {
        return (
            <span className="text-[12px] text-muted-foreground">
                {saving ? "Saving…" : "Not saved yet"}
            </span>
        );
    }
    if ((save === "saved" || save === "idle") && savedAt) {
        return (
            <span
                className="text-[12px] text-muted-foreground"
                suppressHydrationWarning
            >
                Saved {formatDateTime(savedAt)}
            </span>
        );
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

/**
 * A newer version was published than the one these changes were started
 * from. They stay on screen and are listed here, so they can be made again
 * on the newer version; nothing publishes them over it.
 */
function OutdatedNotice() {
    const { outdated, revision, reload } = useDraft();
    if (!outdated) return null;
    const saved = revision > 0;
    return (
        <div
            role="alert"
            className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-[12px] border border-warning/30 bg-warning-subtle px-4 py-3 text-[13px] text-warning-subtle-foreground"
        >
            <div className="grid min-w-0 flex-[1_1_280px] gap-1.5">
                <p>{outdatedMessage(outdated, saved)}</p>
                {outdated.changes.length > 0 && (
                    <ul
                        aria-label="Your changes"
                        className="grid list-disc gap-0.5 pl-[18px] text-[12.5px]"
                    >
                        {outdated.changes.slice(0, 8).map((c, i) => (
                            <li key={`${i}-${c}`}>{c}</li>
                        ))}
                        {outdated.changes.length > 8 && (
                            <li className="list-none">
                                and {outdated.changes.length - 8} more
                            </li>
                        )}
                    </ul>
                )}
            </div>
            {!saved && (
                <Button
                    type="button"
                    variant="outline"
                    className={BAR_BUTTON}
                    onClick={reload}
                >
                    {outdated.to === null
                        ? "Start again"
                        : `Start again from version ${outdated.to}`}
                </Button>
            )}
        </div>
    );
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
                {conflict.newestVersion === undefined
                    ? "Reload draft"
                    : "Reload"}
            </Button>
        </div>
    );
}
