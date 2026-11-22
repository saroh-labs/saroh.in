"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Check, ChevronLeft, MoreHorizontal } from "lucide-react";
import Link from "next/link";

import type { PostEditorModel } from "../editor/post-model";

/** The phone bar's one save word (`blogphone/WXYWrite`, `WXYStates`). */
export function phoneSavedWord(model: PostEditorModel): string {
    const { draft, data } = model;
    if (data.readOnly || data.paused) return "Read only";
    if (draft.saving) return "Saving…";
    if (draft.saveFailed) return "Not saved";
    if (draft.dirty) {
        return draft.fields.title.trim() ? "Unsaved changes" : "Not saved yet";
    }
    if (draft.postId || draft.savedAt) return "Saved";
    return "New post";
}

/**
 * The post editor's bar on a phone (`blogphone/WXYWrite`): ← Website, the
 * post's status over its save word, Details, ⋯ More and Publish, the one
 * black button. A reader and a paused post get no Publish; a draft begun
 * from Ask AI says Save draft there (`WXYStates`).
 */
export function PhonePostBar({
    model,
    onDetails,
    onMore,
    onPublish,
    openNotes,
    askAiStart,
}: {
    model: PostEditorModel;
    onDetails: () => void;
    onMore: () => void;
    onPublish: () => void;
    /** Notes still open, marked on More. */
    openNotes: number;
    /** Started from Ask AI and not yet saved. */
    askAiStart: boolean;
}) {
    const { data, draft } = model;
    const writer = !data.readOnly && !data.paused;
    const word = phoneSavedWord(model);
    const live = model.status.startsWith("Live");
    return (
        <header
            data-post-bar=""
            // At 320 the status and Saved take a row of their own under the
            // buttons, whole, instead of being cut to "L…" and "Save".
            className="flex h-14 shrink-0 items-center gap-0.5 border-b bg-background pl-0.5 pr-2.5 max-[360px]:h-auto max-[360px]:flex-wrap max-[360px]:pt-1.5"
        >
            <Link
                href={`/sites/${data.siteId}/overview`}
                aria-label="Back to Website"
                className="grid size-11 shrink-0 place-items-center rounded-lg transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <ChevronLeft aria-hidden className="size-5" />
            </Link>
            <span aria-hidden className="hidden flex-1 max-[360px]:block" />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 pl-0.5 leading-tight max-[360px]:order-last max-[360px]:basis-full max-[360px]:flex-row max-[360px]:items-center max-[360px]:gap-2 max-[360px]:px-2.5 max-[360px]:pb-2">
                <span
                    data-status-chip=""
                    className={cn(
                        "inline-flex h-[22px] max-w-full items-center gap-[5px] rounded-full px-2 text-xs font-semibold",
                        // Blue, as the desk's chip for the same state (R2.3).
                        live && model.waiting > 0
                            ? "bg-info-subtle text-info-subtle-foreground"
                            : live
                              ? "bg-success-subtle text-success-subtle-foreground"
                              : "bg-secondary text-foreground/80",
                    )}
                >
                    <i
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full bg-current"
                    />
                    <span className="truncate">{model.status}</span>
                </span>
                <span
                    role="status"
                    data-saved-line=""
                    className={cn(
                        "flex max-w-full items-center gap-[3px] truncate text-xs",
                        word === "Not saved"
                            ? "font-semibold text-destructive"
                            : "text-muted-foreground",
                    )}
                >
                    {word === "Saved" ? (
                        <Check
                            aria-hidden
                            className="size-3 shrink-0 text-success"
                        />
                    ) : null}
                    {word}
                </span>
            </div>
            {askAiStart ? null : (
                <Button
                    type="button"
                    variant="ghost"
                    aria-haspopup="dialog"
                    className="h-11 shrink-0 px-2.5"
                    onClick={onDetails}
                >
                    Details
                </Button>
            )}
            <span className="relative shrink-0">
                <IconButton
                    aria-haspopup="dialog"
                    label={
                        openNotes > 0
                            ? `More: preview, feedback (${openNotes} open), versions, share as a post, take off the site, delete`
                            : "More: preview, versions, share as a post, take off the site, delete"
                    }
                    icon={<MoreHorizontal className="size-5" />}
                    tooltip={false}
                    onClick={onMore}
                    className="size-11"
                />
                {openNotes > 0 ? (
                    <span
                        aria-hidden
                        className="pointer-events-none absolute right-2 top-2.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                    />
                ) : null}
            </span>
            {!writer ? null : askAiStart ? (
                <Button
                    type="button"
                    className="h-11 shrink-0 px-3"
                    busy={draft.saving}
                    busyLabel="Saving…"
                    onClick={() => {
                        if (!model.needsTitle()) void draft.save();
                    }}
                >
                    Save draft
                </Button>
            ) : (
                <Button
                    type="button"
                    aria-haspopup="dialog"
                    className="h-11 shrink-0 px-3"
                    busy={draft.publishing}
                    busyLabel="Publishing…"
                    onClick={onPublish}
                >
                    Publish
                </Button>
            )}
        </header>
    );
}
