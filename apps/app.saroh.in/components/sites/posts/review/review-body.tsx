"use client";

import { Button } from "@saroh/ui/button";
import { ChevronDown } from "lucide-react";
import { useRef } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { postParagraphs } from "@/lib/content/plain-text";
import { formatDate } from "@/lib/format/datetime";
import {
    paragraphDiff,
    POST_PART_WORDS,
    postChanges,
} from "@/lib/sites/post-diff";

import type { PostEditorModel } from "../editor/post-model";
import { ReadOnlyBody } from "../post-editor";
import { DiffKey, DiffParagraphs } from "./diff-text";

/**
 * A reader's view of the post's words (`blogdesk/WXWReview`, DEC-200: read
 * only): a live post's changes marked against the live copy, green put in
 * and red taken out, each "Change n of m", with Next change; the other
 * parts that changed named under the key. A post that isn't live, or has
 * no change in its words, reads as today's plain text.
 *
 * The phone editor mounts it as it is (`model` the same `PostEditorModel`).
 */
export function PostReviewBody({ model }: { model: PostEditorModel }) {
    const zone = useBusinessZone();
    const ref = useRef<HTMLDivElement>(null);
    const at = useRef(0);
    const { data, draft, liveCopy } = model;
    const content = draft.fields.content;
    const marks =
        data.readOnly && draft.live && liveCopy
            ? paragraphDiff(
                  postParagraphs(liveCopy.content),
                  postParagraphs(content),
              )
            : null;
    if (!marks || marks.every((p) => p.kind === "same")) {
        return <ReadOnlyBody content={content} />;
    }
    const category =
        data.categories.find((c) => c.id === draft.fields.categoryId)?.name ??
        "";
    const others = postChanges({ ...draft.fields, category }, liveCopy)
        .filter((p) => p !== "words")
        .map((p) => POST_PART_WORDS[p]);
    const of = marks.filter((p) => p.kind !== "same").length;

    function next() {
        at.current = (at.current % of) + 1;
        const el = ref.current?.querySelector<HTMLElement>(
            `[data-change="${at.current}"]`,
        );
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        el?.focus({ preventScroll: true });
    }

    return (
        <div ref={ref} data-post-review="" className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted px-3 py-2 font-sans text-[0.8125rem] text-foreground/80">
                <span>
                    Since the live copy
                    {liveCopy?.publishedAt
                        ? ` of ${formatDate(liveCopy.publishedAt, zone)}`
                        : ""}
                    :
                </span>
                <DiffKey added="added" removed="taken out" />
                <span className="flex-1" />
                <Button type="button" variant="ghost" size="sm" onClick={next}>
                    Next change
                    <ChevronDown aria-hidden className="size-4" />
                </Button>
                {others.length > 0 ? (
                    <span className="basis-full">
                        Also changed: {others.join(", ")}.
                    </span>
                ) : null}
            </div>
            <DiffParagraphs
                paragraphs={marks}
                label={(n, total) => `Change ${n} of ${total}`}
            />
            <p className="text-[12.5px] text-site-muted">
                Shown as plain text. Its formatting and pictures show on the
                site once it is published.
            </p>
        </div>
    );
}
