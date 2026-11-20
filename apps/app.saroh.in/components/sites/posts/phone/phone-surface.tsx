"use client";

import { POST_TITLE_MAX } from "@saroh/api-contract";
import { SiteThemeScope } from "@saroh/site-blocks";
import { Button } from "@saroh/ui/button";
import { Textarea } from "@saroh/ui/textarea";
import type { Editor } from "@tiptap/react";
import { ImageIcon, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";

import { openAskAi } from "@/components/ask-ai/open";
import { useSiteFaces } from "@/components/sites/looks/site-faces";
import { EditorLoading } from "@/components/sites/rich-text/editor-loading";
import { resolveStyleVariables } from "@/lib/sites/style";

import type { PostEditorModel } from "../editor/post-model";
import { EMPTY_POST_HINT, TITLE_NEEDED } from "../editor/writing-surface";
import { ReadOnlyBody } from "../post-editor";

/* On demand and browser-only: the editor is heavy and made in the browser. */
const RichTextEditor = dynamic(
    () =>
        import("@/components/sites/rich-text/rich-text-editor").then(
            (m) => m.RichTextEditor,
        ),
    { ssr: false, loading: () => <EditorLoading className="min-h-64" /> },
);

/**
 * The post as it is written on a phone (`blogphone/WXYWrite`), in the
 * site's own look (`--site-*`, never Saroh's brand): the cover with Change
 * cover, the title, "<Written by> · <category>", then the body. The whole
 * toolbar shows above the text while More formatting is on (C10).
 */
export function PhoneSurface({
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
    onCover: () => void;
}) {
    const { data, draft } = model;
    const { fields, set } = draft;
    const writer = !data.readOnly && !data.paused;
    const editing = writer && !previewing;
    const faces = useSiteFaces();
    const vars = useMemo(
        () =>
            data.style && data.styleOptions
                ? resolveStyleVariables(data.style, data.styleOptions)
                : undefined,
        [data.style, data.styleOptions],
    );
    const category = data.categories.find((c) => c.id === fields.categoryId);
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
        <SiteThemeScope
            name="post-writing-phone"
            variables={vars}
            faces={faces}
            look={data.style?.look}
        >
            <article
                data-writing-surface=""
                aria-label={`Post, in your site's look: ${fields.title || "New post"}`}
                className="min-h-full bg-site-bg px-5 pb-10 text-site-body"
            >
                {fields.image.trim() ? (
                    <div className="relative mt-4 h-[124px] overflow-hidden rounded-md">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL */}
                        <img
                            src={fields.image}
                            alt={fields.imageAlt}
                            className="size-full object-cover"
                        />
                        {editing ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onCover}
                                className="absolute bottom-2.5 left-2.5 h-11 rounded-full border-0 bg-site-bg/95 px-3 font-sans text-[0.8125rem] font-semibold text-site-fg"
                            >
                                <ImageIcon aria-hidden className="size-4" />
                                Change cover
                            </Button>
                        ) : null}
                    </div>
                ) : null}
                <Textarea
                    ref={titleRef}
                    rows={1}
                    maxLength={POST_TITLE_MAX}
                    value={fields.title}
                    readOnly={!editing}
                    onChange={(e) =>
                        set("title")(e.target.value.replace(/\s*\n+\s*/g, " "))
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
                    className="mt-[18px] block min-h-0 w-full resize-none overflow-hidden rounded-md border-0 bg-transparent p-0 font-site-heading text-[1.75rem] font-normal leading-[1.18] text-site-fg outline-none [field-sizing:content] placeholder:text-site-muted focus-visible:ring-0 focus-visible:ring-offset-0 aria-[invalid]:ring-2 aria-[invalid]:ring-destructive"
                />
                {titleError ? (
                    <p
                        id="post-title-error"
                        role="alert"
                        className="mt-1.5 flex items-center gap-1.5 font-sans text-sm font-semibold text-destructive"
                    >
                        <X aria-hidden className="size-[15px]" />
                        {TITLE_NEEDED}
                    </p>
                ) : null}
                <p className="mt-2 font-sans text-[0.8125rem] text-site-muted">
                    {data.author ?? "You"}
                    {category ? ` · ${category.name}` : ""}
                </p>
                {editing ? (
                    <div className="mt-3.5 text-[1.0625rem] leading-relaxed">
                        <RichTextEditor
                            variant="document"
                            value={fields.content}
                            onChange={set("content")}
                            placeholder={fresh ? EMPTY_POST_HINT : "Write…"}
                            toolbar={toolbar}
                            onToolbarChange={onToolbar}
                            onEditor={onEditor}
                        />
                    </div>
                ) : (
                    <ReadOnlyBody content={fields.content} />
                )}
                {fresh && editing ? (
                    <div className="mt-[18px] grid gap-2 font-sans">
                        {data.askAi ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="h-11 justify-start"
                                onClick={openAskAi}
                            >
                                <Sparkles aria-hidden className="size-[18px]" />
                                Ask AI to write a draft
                            </Button>
                        ) : null}
                        <p className="mt-2.5 text-[0.8125rem] text-site-muted">
                            A post saves once it has a title.
                        </p>
                    </div>
                ) : null}
            </article>
        </SiteThemeScope>
    );
}
