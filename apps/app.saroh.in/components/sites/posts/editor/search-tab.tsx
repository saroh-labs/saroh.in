"use client";

import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { FormDialog } from "@saroh/ui/form-dialog";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import { ArrowRightLeft, Sparkles } from "lucide-react";
import { useState } from "react";

import { openAskAi } from "@/components/ask-ai/open";

import {
    GooglePreview,
    SharePreview,
} from "@/components/sites/pages-area/page-previews";

import type { PostEditorModel } from "./post-model";
import { slugFrom } from "./use-post-draft";

/**
 * A length to aim for, and the API's limit (`content/dto.ts`): Google
 * shows about 60 characters of a title and 160 of a description.
 */
const SEARCH_TITLE = { aim: 60, max: 70 };
const SEARCH_TEXT = { aim: 160, max: 300 };

/** "56 of 60 · a good length", or that Google may cut it. */
export function lengthLine(n: number, aim: number): string {
    if (n === 0) return `0 of ${aim}`;
    return n <= aim
        ? `${n} of ${aim} · a good length`
        : `${n} of ${aim} · Google may cut the end off`;
}

/**
 * Inspector › Search and sharing (`blogdesk/WXWSearch`, W8): changed here,
 * beside the post, straight into the draft (it saves as the post does),
 * with the length meters, the Google and WhatsApp previews and the share
 * image. A reader reads what is set. The page link is here (RULES §1); a
 * short link and QR wait for batch 6 (C5).
 */
export function SearchTab({
    model,
    onReplaceCover,
}: {
    model: PostEditorModel;
    onReplaceCover: () => void;
}) {
    const { fields, set } = model.draft;
    const { postsPrefix } = model.data;
    const writer = !model.data.readOnly && !model.data.paused;
    const slug = fields.slug.trim() || slugFrom(fields.title);
    if (writer) {
        return (
            <SearchFields
                model={model}
                form={{
                    seoTitle: fields.seoTitle,
                    setSeoTitle: set("seoTitle"),
                    seoText: fields.seoDescription,
                    setSeoText: set("seoDescription"),
                    slug: fields.slug,
                    setSlug: set("slug"),
                }}
                onReplaceCover={onReplaceCover}
                stacked
            />
        );
    }
    return (
        <dl className="grid gap-3 text-sm [&_dd]:mt-0.5 [&_dt]:text-[0.8125rem] [&_dt]:text-muted-foreground">
            <div>
                <dt>Title in search</dt>
                <dd>
                    {fields.seoTitle.trim() || fields.title || "No title yet"}
                </dd>
            </div>
            <div>
                <dt>Description in search</dt>
                <dd>
                    {fields.seoDescription.trim() ||
                        fields.excerpt.trim() ||
                        "Google picks a line from the post."}
                </dd>
            </div>
            <div>
                <dt>Page link</dt>
                <dd className="font-mono text-[0.8125rem]">
                    /{postsPrefix}/{slug}
                </dd>
            </div>
        </dl>
    );
}

/** The length line under a search field, over a bar to the length aimed for. */
function LengthMeter({ n, aim }: { n: number; aim: number }) {
    return (
        <span className="grid gap-1">
            <span
                aria-hidden
                className="relative h-1 overflow-hidden rounded-full bg-secondary"
            >
                <i
                    className={
                        n > aim
                            ? "absolute inset-y-0 left-0 w-full bg-warning"
                            : "absolute inset-y-0 left-0 bg-success"
                    }
                    style={
                        n > aim ? undefined : { width: `${(100 * n) / aim}%` }
                    }
                />
            </span>
            <span className="text-right">{lengthLine(n, aim)}</span>
        </span>
    );
}

/** What Search and sharing edits, copied from the draft when it opens. */
function useSearchForm(model: PostEditorModel) {
    const { fields, set } = model.draft;
    const [seoTitle, setSeoTitle] = useState(fields.seoTitle);
    const [seoText, setSeoText] = useState(fields.seoDescription);
    const [slug, setSlug] = useState(fields.slug);
    return {
        seoTitle,
        setSeoTitle,
        seoText,
        setSeoText,
        slug,
        setSlug,
        reset: () => {
            setSeoTitle(fields.seoTitle);
            setSeoText(fields.seoDescription);
            setSlug(fields.slug);
        },
        dirty:
            seoTitle !== fields.seoTitle ||
            seoText !== fields.seoDescription ||
            slug !== fields.slug,
        save: () => {
            if (seoTitle !== fields.seoTitle) set("seoTitle")(seoTitle);
            if (seoText !== fields.seoDescription)
                set("seoDescription")(seoText);
            if (slug !== fields.slug) set("slug")(slug);
        },
    };
}
/** The values the fields show and change: a copy (the sheet) or the draft. */
interface SearchForm {
    seoTitle: string;
    setSeoTitle: (v: string) => void;
    seoText: string;
    setSeoText: (v: string) => void;
    slug: string;
    setSlug: (v: string) => void;
}

export function SearchSheet({
    model,
    open,
    onOpenChange,
    onReplaceCover,
}: {
    model: PostEditorModel;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onReplaceCover: () => void;
}) {
    const form = useSearchForm(model);
    // A fresh copy each time it opens, so Cancel drops what was typed.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) form.reset();
    }
    return (
        <FormDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title="Search and sharing"
            description="How this post can show on Google and when its link is shared, and its page link."
            dirty={form.dirty}
            className="max-w-[1000px]"
            footNote="Goes live when you publish"
            onSubmit={() => {
                form.save();
                onOpenChange(false);
            }}
        >
            <SearchFields
                model={model}
                form={form}
                onReplaceCover={onReplaceCover}
            />
        </FormDialog>
    );
}

/** The fields and the Google and WhatsApp previews: two columns, or one. */
function SearchFields({
    model,
    form,
    onReplaceCover,
    stacked = false,
}: {
    model: PostEditorModel;
    form: SearchForm;
    onReplaceCover: () => void;
    stacked?: boolean;
}) {
    const { fields } = model.draft;
    const { postsPrefix, address, siteName } = model.data;
    const { seoTitle, setSeoTitle, seoText, setSeoText, slug, setSlug } = form;
    const shownSlug = slug.trim() || slugFrom(fields.title);
    const liveSlug = model.liveCopy?.slug ?? null;
    const moved = liveSlug !== null && shownSlug !== liveSlug;
    const link = `${address ?? ""}/${postsPrefix}/${shownSlug}`;
    return (
        <div className={stacked ? "grid gap-7" : "grid gap-7 md:grid-cols-2"}>
            <div className="grid content-start gap-5">
                <div className="relative grid">
                    {model.data.askAi ? (
                        // Beside the label, never inside it (W8.3).
                        <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="absolute right-0 top-[-4px]"
                            onClick={openAskAi}
                        >
                            <Sparkles aria-hidden className="size-3.5" />
                            Ask AI to write it
                        </Button>
                    ) : null}
                    <Field
                        holdsData={false}
                        label="Title in search"
                        hint={
                            <LengthMeter
                                n={(seoTitle || fields.title).length}
                                aim={SEARCH_TITLE.aim}
                            />
                        }
                    >
                        <Input
                            value={seoTitle}
                            maxLength={SEARCH_TITLE.max}
                            placeholder={fields.title}
                            onChange={(e) => setSeoTitle(e.target.value)}
                        />
                    </Field>
                </div>
                <Field
                    holdsData={false}
                    label="Description in search"
                    hint={
                        <LengthMeter
                            n={(seoText || fields.excerpt).length}
                            aim={SEARCH_TEXT.aim}
                        />
                    }
                >
                    <Textarea
                        rows={3}
                        value={seoText}
                        maxLength={SEARCH_TEXT.max}
                        placeholder={fields.excerpt}
                        onChange={(e) => setSeoText(e.target.value)}
                    />
                </Field>
                <Field label="Page link" htmlFor="post-page-link">
                    <div className="grid gap-1.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 font-mono text-sm text-muted-foreground">
                                /{postsPrefix}/
                            </span>
                            <Input
                                id="post-page-link"
                                value={slug}
                                maxLength={200}
                                placeholder={slugFrom(fields.title)}
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                onChange={(e) => setSlug(e.target.value)}
                                className="min-w-0 font-mono"
                            />
                        </div>
                        {moved ? (
                            <p className="flex items-start gap-2 text-[0.8125rem] text-foreground/75">
                                <ArrowRightLeft
                                    aria-hidden
                                    className="mt-0.5 size-[15px] shrink-0"
                                />
                                <span>
                                    Changed from{" "}
                                    <span className="font-mono">
                                        /{postsPrefix}/{liveSlug}
                                    </span>
                                    . When you publish the post, the old link
                                    forwards here.
                                </span>
                            </p>
                        ) : (
                            <small className="text-xs text-muted-foreground">
                                Left empty, it follows the title.
                            </small>
                        )}
                    </div>
                </Field>
            </div>
            <div className="grid content-start gap-5">
                <div className="grid gap-2">
                    <p className="text-[0.8125rem] font-semibold">
                        Google{" "}
                        <span className="font-normal text-muted-foreground">
                            how this post can show in search
                        </span>
                    </p>
                    <GooglePreview
                        siteName={siteName}
                        link={link}
                        title={seoTitle.trim() || fields.title}
                        text={seoText.trim() || fields.excerpt.trim() || null}
                    />
                </div>
                <div className="grid gap-2">
                    <p className="text-[0.8125rem] font-semibold">
                        WhatsApp{" "}
                        <span className="font-normal text-muted-foreground">
                            when someone shares the link
                        </span>
                    </p>
                    <SharePreview
                        image={fields.image.trim() || null}
                        title={fields.title}
                        text={fields.excerpt.trim() || null}
                        host={address}
                    />
                </div>
                <div className="flex items-center gap-3 rounded-xl border p-3">
                    <span className="min-w-0 flex-1 text-[0.8125rem]">
                        <b className="block text-sm">Share image</b>
                        {fields.image.trim()
                            ? "The cover"
                            : "No cover yet: links show without a picture"}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onReplaceCover}
                    >
                        {fields.image.trim() ? "Replace" : "Add a cover"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
