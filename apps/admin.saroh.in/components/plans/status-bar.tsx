"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { formatDateTime } from "@/lib/format";
import {
    changeCount,
    namesList,
    otherEditors,
    outdatedMessage,
} from "@/lib/pricing-draft";

import { useDraft } from "./draft-store";
import { usePlans } from "./plans-context";
import { usePlansNav } from "./plans-nav";
import { draftChanges, moversLine } from "./preview/changes";
import { usePreview } from "./preview/preview-state";
import { useFlash } from "./toast";

/**
 * The draft bar (admin redesign U13, R18): fixed at the foot of the screen
 * while there is a draft, with how many changes it holds, who would move at
 * renewal, whether it is saved, Discard… and Review and publish. With no
 * draft there is no bar; the header says what is live.
 *
 * It says one thing at a time (owner, 13 Oct: never stacked notes). A
 * problem takes the bar's words instead of being added under them, most
 * pressing first: a draft a newer version has overtaken, or someone else's
 * save (a 409), then a save that failed, then a preview that didn't open,
 * then a draft that doesn't add up yet. Each comes with its one way out.
 */

type Notice =
    "outdated" | "conflict" | "failed" | "preview" | "invalid" | "plain";

export function noticeOf(input: {
    outdated: boolean;
    conflict: { newestVersion?: number | null } | null;
    save: string;
    previewError: string | null;
    valid: boolean;
}): Notice {
    // Someone else's save is the news until it is reloaded; otherwise a
    // newer version is, as soon as the page has read it.
    if (
        input.outdated &&
        (input.conflict === null || input.conflict.newestVersion !== undefined)
    ) {
        return "outdated";
    }
    if (input.conflict) return "conflict";
    if (input.save === "failed") return "failed";
    if (input.previewError) return "preview";
    if (!input.valid) return "invalid";
    return "plain";
}

const BAR_BUTTON = "h-[34px] rounded-[9px] px-3.5 text-[13px]";

export function StatusBar() {
    const { hasDraft } = useDraft();
    if (!hasDraft) return null;
    return <DraftBar />;
}

function DraftBar() {
    const { access } = usePlans();
    const draft = useDraft();
    const preview = usePreview();
    const { tab, setTab } = usePlansNav();

    const notice = noticeOf({
        outdated: draft.outdated !== null,
        conflict: draft.conflict,
        save: draft.save,
        previewError: preview.fullError,
        valid: draft.check.valid,
    });
    const problem = notice !== "plain" && notice !== "invalid";

    return (
        <section
            aria-label="Draft"
            className={cn(
                "fixed inset-x-0 bottom-4 z-[60] mx-auto flex w-[min(820px,calc(100%-32px))] flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[14px] border px-4 py-3 text-[13.5px] shadow-lg",
                problem
                    ? "border-warning/40 bg-warning-subtle text-warning-subtle-foreground"
                    : "border-transparent bg-foreground text-background",
            )}
        >
            <div
                role={problem ? "alert" : undefined}
                aria-live={problem ? undefined : "polite"}
                className="grid min-w-0 flex-[1_1_300px] gap-1"
            >
                <Message notice={notice} />
            </div>
            <Way notice={notice} />
            {access.canEdit &&
                (notice === "plain" ||
                    notice === "invalid" ||
                    notice === "failed") && (
                    <SaveDraftButton quiet={!problem} />
                )}
            {access.canEdit && !problem && <DiscardButton />}
            {access.canEdit && tab !== "publish" && notice !== "outdated" && (
                <Button
                    type="button"
                    variant={problem ? "outline" : "secondary"}
                    className={BAR_BUTTON}
                    onClick={() => setTab("publish")}
                >
                    Review and publish
                </Button>
            )}
        </section>
    );
}

function Message({ notice }: { notice: Notice }) {
    const draft = useDraft();
    const preview = usePreview();
    const { pricing } = usePlans();

    if (notice === "outdated" && draft.outdated) {
        const o = draft.outdated;
        return (
            <>
                <p>{outdatedMessage(o, draft.revision > 0)}</p>
                {o.changes.length > 0 && (
                    <details className="text-[12.5px]">
                        <summary className="cursor-pointer font-semibold">
                            Your {changeCount(o.changes.length)}
                        </summary>
                        <ul
                            aria-label="Your changes"
                            className="mt-1 grid list-disc gap-0.5 pl-[18px]"
                        >
                            {o.changes.slice(0, 8).map((c, i) => (
                                <li key={`${i}-${c}`}>{c}</li>
                            ))}
                            {o.changes.length > 8 && (
                                <li className="list-none">
                                    and {o.changes.length - 8} more
                                </li>
                            )}
                        </ul>
                    </details>
                )}
            </>
        );
    }
    if (notice === "conflict" || notice === "failed") {
        return (
            <p>
                {draft.saveError ??
                    (notice === "failed"
                        ? "The draft could not be saved."
                        : "Someone else saved the draft since.")}
            </p>
        );
    }
    if (notice === "preview") return <p>{preview.fullError}</p>;

    const first = draft.live === null;
    const head = !draft.check.valid
        ? "Not ready to publish."
        : first
          ? "The first version, not live yet."
          : `${changeCount(draft.check.changes.length)}, not live yet.`;
    const second = !draft.check.valid
        ? notReady(draft.check.errors)
        : first
          ? "Publishing makes it version 1."
          : moversLine(
                draftChanges(draft.live?.catalog ?? null, draft.catalog),
                draft.catalog?.plans ?? [],
                pricing.plans,
            );
    return (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <strong className="font-semibold">{head}</strong>
            <span>{second}</span>
            <SaveState />
        </p>
    );
}

function notReady(errors: readonly string[]): string {
    const first = errors.at(0) ?? "The draft doesn't add up yet";
    const more = errors.length - 1;
    return `${first}${more > 0 ? ` · and ${more} more` : ""}`;
}

/** The one way out of the bar's problem, beside its words. */
function Way({ notice }: { notice: Notice }) {
    const draft = useDraft();
    const preview = usePreview();
    let way: ReactNode = null;
    if (notice === "outdated" && draft.outdated && draft.revision === 0) {
        way = (
            <Button
                type="button"
                variant="outline"
                className={BAR_BUTTON}
                onClick={draft.reload}
            >
                {draft.outdated.to === null
                    ? "Start again"
                    : `Start again from version ${draft.outdated.to}`}
            </Button>
        );
    } else if (notice === "outdated") {
        // Saved, so it can only be discarded and made again on the newer one.
        way = draft.canEdit ? <DiscardButton /> : null;
    } else if (notice === "conflict") {
        way = (
            <Button
                type="button"
                variant="outline"
                className={BAR_BUTTON}
                onClick={draft.reload}
            >
                {draft.conflict?.newestVersion === undefined
                    ? "Reload draft"
                    : "Reload"}
            </Button>
        );
    } else if (notice === "failed") {
        way = (
            <Button
                type="button"
                variant="outline"
                className={BAR_BUTTON}
                onClick={draft.retry}
            >
                Try again
            </Button>
        );
    } else if (notice === "preview") {
        way = (
            <>
                <Button
                    type="button"
                    variant="outline"
                    className={BAR_BUTTON}
                    onClick={() => void preview.openFull()}
                    disabled={preview.opening}
                >
                    {preview.opening ? "Opening…" : "Try the preview again"}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    className={BAR_BUTTON}
                    onClick={preview.clearFullError}
                >
                    Close
                </Button>
            </>
        );
    }
    return way;
}

function DiscardButton() {
    const { me } = usePlans();
    const draft = useDraft();
    const flash = useFlash();
    const others = otherEditors(draft.editors, me);
    return (
        <OperatorDialog
            trigger="Discard…"
            triggerVariant="outline"
            triggerClassName={cn(
                BAR_BUTTON,
                "border-current/30 bg-transparent text-current hover:bg-background/10",
            )}
            title="Discard the draft?"
            effect={
                others.length > 0 ? (
                    <p>
                        {namesList(others)}{" "}
                        {others.length === 1 ? "has" : "have"} edited this draft
                        too. Discarding throws away their changes as well as
                        yours. The live pricing stays as it is.
                    </p>
                ) : (
                    <p>
                        Every change in the draft is thrown away. The live
                        pricing stays as it is.
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
    );
}

/** Whether what is on screen is saved: "Saving…", "Not saved yet", "Saved 14:05". */
function SaveState() {
    const { save, saving, savedAt } = useDraft();
    if (save === "saving") {
        return (
            <span className="text-[12px] opacity-80">
                {saving ? "Saving…" : "Not saved yet"}
            </span>
        );
    }
    if (!savedAt) return null;
    return (
        <span className="text-[12px] opacity-80" suppressHydrationWarning>
            Saved {formatDateTime(savedAt)}
        </span>
    );
}

/**
 * "Save draft": the draft autosaves, and this saves it now, so nobody has
 * to trust a pause. It reads "Saved" (and can't be pressed) when what is on
 * screen is saved, "Saving…" while a save is on its way, and "Save draft"
 * when something isn't saved yet, a failed save included.
 */
function SaveDraftButton({ quiet }: { quiet: boolean }) {
    const { save, saving, revision, flush, retry } = useDraft();
    const unsaved = save === "saving" || save === "failed" || revision === 0;
    const label = saving ? "Saving…" : unsaved ? "Save draft" : "Saved";
    return (
        <Button
            type="button"
            variant={quiet ? "ghost" : "outline"}
            className={cn(
                BAR_BUTTON,
                quiet &&
                    "text-current hover:bg-background/10 hover:text-current",
            )}
            disabled={saving || !unsaved}
            aria-busy={saving}
            onClick={() => (save === "failed" ? retry() : void flush())}
        >
            {label}
        </Button>
    );
}
