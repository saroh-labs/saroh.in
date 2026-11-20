"use client";

import { POST_TITLE_MAX } from "@saroh/api-contract";
import { SiteThemeScope } from "@saroh/site-blocks";
import { Button } from "@saroh/ui/button";
import { Textarea } from "@saroh/ui/textarea";
import type { Editor } from "@tiptap/react";
import { ImagePlus, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";

import { openAskAi } from "@/components/ask-ai/open";
import { useSiteFaces } from "@/components/sites/looks/site-faces";
import { EditorLoading } from "@/components/sites/rich-text/editor-loading";
import { postParagraphs } from "@/lib/content/plain-text";
import { formatNumber } from "@/lib/format/money";
import { resolveStyleVariables } from "@/lib/sites/style";

import { PostReviewBody } from "../review/review-body";
import type { PostEditorModel } from "./post-model";

/* On demand and browser-only: the editor is heavy and made in the browser. */
const RichTextEditor = dynamic(
    () =>
        import("@/components/sites/rich-text/rich-text-editor").then(
            (m) => m.RichTextEditor,
        ),
    { ssr: false, loading: () => <EditorLoading className="min-h-64" /> },
);

/** About how fast a customer reads, for "n min read". */
const WORDS_PER_MINUTE = 200;

/** Words and minutes to read, from the body's text. */
export function readingOf(html: string): { words: number; minutes: number } {
    const words = postParagraphs(html)
        .join(" ")
        .split(/\s+/)
        .filter(Boolean).length;
    return { words, minutes: Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)) };
}

export const EMPTY_POST_HINT =
    "Write about a service and customers can book it from the post.";
export const TITLE_NEEDED = "A post needs a title.";

/**
 * The page a post is written on (`blogdesk/WXWWrite`), in the site's own
 * look (`--site-*`, never Saroh's brand): category and read time, the
 * title, "By <writer> · <business>", the cover with Replace cover and
 * Describe the photo, then the body. The bar above it says where it will
 * be and how long it is.
 */
export function WritingSurface({
    model,
    previewing,
    titleError,
    toolbar,
    onToolbar,
    onEditor,
    onCover,
}: {
    model: PostEditorModel;
    previewing: boolean;
    titleError: boolean;
    toolbar: boolean;
    onToolbar: (open: boolean) => void;
    onEditor: (editor: Editor | null) => void;
    /** Open the cover editor (Details › Cover). */
    onCover: () => void;
}) {
    const { data, draft } = model;
    const { fields, set } = draft;
    const writer = !data.readOnly && !data.paused;
    const faces = useSiteFaces();
    const vars = useMemo(
        () =>
            data.style && data.styleOptions
                ? resolveStyleVariables(data.style, data.styleOptions)
                : undefined,
        [data.style, data.styleOptions],
    );
    const category = data.categories.find((c) => c.id === fields.categoryId);
    const reading = readingOf(fields.content);
    const link = `${data.address ?? ""}/${data.postsPrefix}/${fields.slug.trim() || "…"}`;
    const fresh =
        !draft.postId && !fields.title.trim() && !fields.content.trim();

    // The title grows with its text where `field-sizing` isn't supported.
    const titleRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        const box = titleRef.current;
        if (!box) return;
        box.style.height = "auto";
        box.style.height = `${box.scrollHeight}px`;
    }, [fields.title]);
    useEffect(() => {
        if (titleError) titleRef.current?.focus();
    }, [titleError]);

    return (
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <div
                data-canvas-bar=""
                className="flex h-7 shrink-0 items-center gap-2.5 bg-muted px-4 font-mono text-xs text-muted-foreground"
            >
                <span
                    aria-hidden
                    className="size-[7px] shrink-0 rounded-full bg-muted-foreground/60"
                />
                <b className="min-w-0 truncate font-medium text-foreground">
                    {link}
                </b>
                <span className="flex-1" />
                {writer && !previewing ? (
                    <Button
                        type="button"
                        variant="link"
                        size="inline"
                        aria-pressed={toolbar}
                        onClick={() => onToolbar(!toolbar)}
                        className="font-sans text-xs font-normal text-muted-foreground hover:text-foreground"
                    >
                        {toolbar ? "Hide formatting" : "More formatting"}
                    </Button>
                ) : null}
                <span>
                    {formatNumber(reading.words)} words · {reading.minutes} min
                    read
                </span>
            </div>
            <div className="min-h-0 overflow-y-auto bg-muted/60 px-6 py-8">
                <SiteThemeScope
                    name="post-writing"
                    variables={vars}
                    faces={faces}
                    look={data.style?.look}
                >
                    <article
                        data-writing-surface=""
                        aria-label={`Writing surface: ${fields.title || "New post"}`}
                        className="mx-auto w-full max-w-[760px] rounded-lg bg-site-bg px-14 py-12 text-site-body shadow-sm"
                    >
                        <p className="font-site-body text-sm text-site-muted">
                            {category ? `${category.name} · ` : ""}
                            {reading.minutes} min read
                        </p>
                        <Textarea
                            ref={titleRef}
                            rows={1}
                            maxLength={POST_TITLE_MAX}
                            value={fields.title}
                            readOnly={!writer || previewing}
                            onChange={(e) =>
                                set("title")(
                                    e.target.value.replace(/\s*\n+\s*/g, " "),
                                )
                            }
                            onKeyDown={(e) => {
                                if (e.key === "Enter") e.preventDefault();
                            }}
                            placeholder="Title"
                            aria-label="Post title"
                            aria-invalid={titleError || undefined}
                            aria-describedby={
                                titleError ? "post-title-error" : undefined
                            }
                            className="mt-2 block min-h-0 w-full resize-none overflow-hidden rounded-md border-0 bg-transparent p-0 font-site-heading text-4xl font-normal leading-tight text-site-fg outline-none [field-sizing:content] placeholder:text-site-muted focus-visible:ring-0 focus-visible:ring-offset-0 aria-[invalid]:ring-2 aria-[invalid]:ring-destructive"
                        />
                        {titleError ? (
                            <p
                                id="post-title-error"
                                role="alert"
                                className="mt-1.5 flex items-center gap-1.5 font-sans text-[0.8125rem] font-semibold text-destructive"
                            >
                                <X aria-hidden className="size-[15px]" />
                                {TITLE_NEEDED}
                            </p>
                        ) : null}
                        <p className="mt-2 font-site-body text-sm text-site-muted">
                            By {data.author ?? "you"} · {data.siteName}
                        </p>
                        {fields.image.trim() ? (
                            <div className="relative mt-6 overflow-hidden rounded-md">
                                {/* eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL */}
                                <img
                                    src={fields.image}
                                    alt={fields.imageAlt}
                                    className="aspect-[1.91/1] w-full object-cover"
                                />
                                {writer && !previewing ? (
                                    <div className="absolute bottom-3 right-3 flex gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="bg-background"
                                            onClick={onCover}
                                        >
                                            Replace cover
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="bg-background"
                                            onClick={onCover}
                                        >
                                            Describe the photo
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        ) : writer && !previewing ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="mt-4 font-sans text-site-muted"
                                onClick={onCover}
                            >
                                <ImagePlus aria-hidden className="size-4" />
                                Add a cover
                            </Button>
                        ) : null}

                        {!writer ? (
                            <PostReviewBody model={model} />
                        ) : (
                            <div className="mt-6">
                                <RichTextEditor
                                    variant="document"
                                    value={fields.content}
                                    onChange={set("content")}
                                    placeholder={
                                        fresh ? EMPTY_POST_HINT : "Write…"
                                    }
                                    toolbar={toolbar && !previewing}
                                    onToolbarChange={onToolbar}
                                    onEditor={onEditor}
                                />
                            </div>
                        )}
                        {fresh && writer && !previewing ? (
                            <div className="mt-4 grid gap-4 font-sans">
                                {data.askAi ? (
                                    <div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={openAskAi}
                                        >
                                            <Sparkles
                                                aria-hidden
                                                className="size-4"
                                            />
                                            Ask AI to write a draft
                                        </Button>
                                    </div>
                                ) : null}
                                <p className="text-[0.8125rem] text-site-muted">
                                    A post saves once it has a title.
                                </p>
                            </div>
                        ) : null}
                    </article>
                </SiteThemeScope>
            </div>
        </div>
    );
}
