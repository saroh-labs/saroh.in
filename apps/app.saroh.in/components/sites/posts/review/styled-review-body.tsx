"use client";

import { Button } from "@saroh/ui/button";
import { ArrowDown } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useSyncExternalStore } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { EditorLoading } from "@/components/sites/rich-text/editor-loading";
import { formatDate } from "@/lib/format/datetime";
import { POST_PART_WORDS, postChanges } from "@/lib/sites/post-diff";

import type { PostEditorModel } from "../editor/post-model";
import { QUOTE_MAX } from "../post-feedback";
import {
    ChangeMarks,
    FeedbackBlocks,
    liveBlocks,
    liveKeys,
} from "./change-marks";

const RichTextEditor = dynamic(
    () =>
        import("@/components/sites/rich-text/rich-text-editor").then(
            (m) => m.RichTextEditor,
        ),
    { ssr: false, loading: () => <EditorLoading className="min-h-64" /> },
);

const noop = () => undefined;

/**
 * A desk reader's post (R3, `blogdesk/WXWReview`): drawn as it looks on
 * the site, through the same read-only editor schema (so a draft is never
 * rendered as raw markup), and on a live post each new or changed block
 * ringed "Change n of m" against the live copy, with Next change. The
 * phone draws it too (R2, `blogphone/WXYReview`): there a reader who may
 * comment taps a paragraph for feedback on it.
 */
export function StyledReviewBody({
    model,
    onParagraphFeedback,
    legend = true,
}: {
    model: PostEditorModel;
    /** A reader who may comment: feedback on the paragraph tapped (R2). */
    onParagraphFeedback?: (words: string) => void;
    /**
     * Draw the "Since the live copy" line over the post (the phone). The
     * desk draws it in the canvas bar instead (`ReviewLegend`, R3.2).
     */
    legend?: boolean;
}) {
    const { draft } = model;
    const { comparing, liveHtml } = useReviewCompare(model);
    // Read in the browser only: the server has no DOMParser (bug, 22 Nov).
    const hydrated = useHydrated();
    const live = useMemo(
        () => (liveHtml === null || !hydrated ? null : liveKeys(liveHtml)),
        [liveHtml, hydrated],
    );
    const tappable = Boolean(onParagraphFeedback);
    const extensions = useMemo(
        () => [
            ...(live ? [ChangeMarks.configure({ live })] : []),
            ...(tappable ? [FeedbackBlocks] : []),
        ],
        [live, tappable],
    );

    // R2: a tap (or Enter) on a paragraph opens feedback on its words.
    const feedbackOn = onParagraphFeedback
        ? (target: EventTarget) => {
              if (!(target instanceof Element)) return;
              const block = target.closest(".ProseMirror > *");
              const words = block?.textContent.trim();
              if (words) onParagraphFeedback(words.slice(0, QUOTE_MAX));
          }
        : undefined;

    return (
        <div data-post-review="styled" className="mt-6 space-y-4">
            {comparing && legend ? (
                <div className="sticky top-0 z-10 -mx-5 border-b border-site-border bg-site-surface px-5 py-1.5 md:static md:mx-0 md:bg-transparent md:px-0">
                    <ReviewLegend model={model} onSite />
                </div>
            ) : null}
            {feedbackOn ? (
                <p className="font-sans text-[0.8125rem] text-site-muted">
                    Tap a paragraph to give feedback on it.
                </p>
            ) : null}
            {/* The paragraphs are the targets (focusable, FeedbackBlocks); Enter on one works as a tap. */}
            <div
                data-paragraph-feedback={feedbackOn ? "" : undefined}
                onClick={feedbackOn ? (e) => feedbackOn(e.target) : undefined}
                onKeyDown={
                    feedbackOn
                        ? (e) => {
                              if (e.key === "Enter") feedbackOn(e.target);
                          }
                        : undefined
                }
                className={
                    feedbackOn
                        ? "[&_.ProseMirror>*:hover]:bg-info-subtle [&_.ProseMirror>*]:cursor-pointer [&_.ProseMirror>*]:rounded-sm"
                        : undefined
                }
            >
                <RichTextEditor
                    variant="document"
                    readOnly
                    value={draft.fields.content}
                    onChange={noop}
                    extensions={extensions}
                />
            </div>
            {liveHtml !== null && hydrated ? (
                <TakenOut content={draft.fields.content} liveHtml={liveHtml} />
            ) : null}
        </div>
    );
}

/** True once in the browser (false on the server and the first paint). */
function useHydrated(): boolean {
    return useSyncExternalStore(
        subscribeNever,
        () => true,
        () => false,
    );
}
const subscribeNever = () => () => undefined;

/** Whether this reader compares against the live copy, and its words. */
function useReviewCompare(model: PostEditorModel) {
    const { data, draft, liveCopy } = model;
    // Only a reader compares; a writer's preview reads as the post.
    const comparing =
        (data.readOnly || data.paused) && draft.live && liveCopy !== null;
    return {
        comparing,
        liveCopy,
        liveHtml: comparing ? liveCopy.content : null,
    };
}

/**
 * "Since the live copy of 26 Sep", what else changed, and Next change
 * (R3): one line, no box. The desk's canvas bar draws it; the phone's
 * post draws it on top. Null when the reader isn't comparing.
 */
export function ReviewLegend({
    model,
    onSite = false,
}: {
    model: PostEditorModel;
    /** Drawn on the merchant's page (the phone): the site's own colours. */
    onSite?: boolean;
}) {
    const zone = useBusinessZone();
    const { draft, data } = model;
    const { comparing, liveCopy } = useReviewCompare(model);
    if (!comparing || !liveCopy) return null;
    const category =
        data.categories.find((c) => c.id === draft.fields.categoryId)?.name ??
        "";
    const others = postChanges({ ...draft.fields, category }, liveCopy)
        .filter((p) => p !== "words")
        .map((p) => POST_PART_WORDS[p]);
    return (
        <span
            data-review-legend=""
            className={`flex min-w-0 items-center gap-x-3 ${onSite ? "flex-wrap" : "shrink"} gap-y-0.5 font-sans text-[0.8125rem] ${onSite ? "text-site-muted" : "text-muted-foreground"}`}
        >
            <span className={onSite ? "min-w-0" : "min-w-0 truncate"}>
                Since the live copy
                {liveCopy.publishedAt
                    ? ` of ${formatDate(liveCopy.publishedAt, zone)}`
                    : ""}
                {others.length > 0
                    ? ` · also changed: ${others.join(", ")}`
                    : ""}
            </span>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-auto px-1.5 py-0.5 font-semibold coarse:min-h-11 ${onSite ? "text-site-fg hover:bg-site-surface hover:text-site-fg" : "text-foreground"}`}
                onClick={nextChange}
            >
                Next change
                <ArrowDown aria-hidden className="size-4" />
            </Button>
        </span>
    );
}

let at = 0;
/** Scroll to the next ringed block, round to the first. */
function nextChange() {
    const marks = document.querySelectorAll<HTMLElement>(
        "[data-post-review] [data-change]",
    );
    if (marks.length === 0) return;
    at = (at % marks.length) + 1;
    const el = marks[at - 1];
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
}

/**
 * What the draft took out of the live copy (R1, R3), struck through,
 * whole blocks: words in a block aren't marked (owner, 22 Nov).
 */
function TakenOut({
    content,
    liveHtml,
}: {
    content: string;
    liveHtml: string;
}) {
    // Read as text, never drawn as markup: inert parses of both.
    const gone = useMemo(() => {
        const now = new Set(liveKeys(content));
        return liveBlocks(liveHtml).filter(
            (b) => b.key.startsWith("t:") && !now.has(b.key),
        );
    }, [content, liveHtml]);
    if (gone.length === 0) return null;
    return (
        <div data-taken-out="" className="space-y-2">
            <p className="font-sans text-[0.8125rem] font-semibold text-site-muted">
                Taken out since the live copy
            </p>
            {gone.map((b) => (
                <del
                    key={b.key}
                    className="block rounded-sm bg-destructive-subtle px-1 text-destructive-subtle-foreground decoration-destructive-subtle-foreground/60"
                >
                    {b.text}
                </del>
            ))}
        </div>
    );
}
