"use client";

import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { FormDialog } from "@saroh/ui/form-dialog";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import { ArrowRightLeft, Pencil } from "lucide-react";
import { useState } from "react";

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
 * Inspector › Search and sharing (`blogdesk/WXWSearch`): what is set, read
 * first, and the sheet that changes it. The page link is here (RULES §1);
 * a short link and QR wait for batch 6 (C5).
 */
export function SearchTab({
    model,
    onReplaceCover,
}: {
    model: PostEditorModel;
    onReplaceCover: () => void;
}) {
    const [open, setOpen] = useState(false);
    const { fields } = model.draft;
    const { postsPrefix } = model.data;
    const writer = !model.data.readOnly && !model.data.paused;
    const slug = fields.slug.trim() || slugFrom(fields.title);
    return (
        <div className="grid gap-4 text-sm">
            <dl className="grid gap-3 [&_dd]:mt-0.5 [&_dt]:text-[0.8125rem] [&_dt]:text-muted-foreground">
                <div>
                    <dt>Title in search</dt>
                    <dd>
                        {fields.seoTitle.trim() ||
                            fields.title ||
                            "No title yet"}
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
            {writer ? (
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(true)}
                >
                    <Pencil aria-hidden className="size-4" />
                    Change search and sharing
                </Button>
            ) : null}
            <SearchSheet
                model={model}
                open={open}
                onOpenChange={setOpen}
                onReplaceCover={() => {
                    setOpen(false);
                    onReplaceCover();
                }}
            />
        </div>
    );
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
    const { fields, set } = model.draft;
    const { postsPrefix, address, siteName } = model.data;
    const [seoTitle, setSeoTitle] = useState(fields.seoTitle);
    const [seoText, setSeoText] = useState(fields.seoDescription);
    const [slug, setSlug] = useState(fields.slug);
    // A fresh copy each time it opens, so Cancel drops what was typed.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setSeoTitle(fields.seoTitle);
            setSeoText(fields.seoDescription);
            setSlug(fields.slug);
        }
    }
    const shownSlug = slug.trim() || slugFrom(fields.title);
    const liveSlug = model.liveCopy?.slug ?? null;
    const moved = liveSlug !== null && shownSlug !== liveSlug;
    const link = `${address ?? ""}/${postsPrefix}/${shownSlug}`;
    return (
        <FormDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title="Search and sharing"
            description="How this post can show on Google and when its link is shared, and its page link."
            dirty={
                seoTitle !== fields.seoTitle ||
                seoText !== fields.seoDescription ||
                slug !== fields.slug
            }
            className="max-w-[1000px]"
            footNote="Goes live when you publish"
            onSubmit={() => {
                if (seoTitle !== fields.seoTitle) set("seoTitle")(seoTitle);
                if (seoText !== fields.seoDescription)
                    set("seoDescription")(seoText);
                if (slug !== fields.slug) set("slug")(slug);
                onOpenChange(false);
            }}
        >
            <div className="grid gap-7 md:grid-cols-2">
                <div className="grid content-start gap-5">
                    <Field
                        holdsData={false}
                        label="Title in search"
                        hint={lengthLine(
                            (seoTitle || fields.title).length,
                            SEARCH_TITLE.aim,
                        )}
                    >
                        <Input
                            value={seoTitle}
                            maxLength={SEARCH_TITLE.max}
                            placeholder={fields.title}
                            onChange={(e) => setSeoTitle(e.target.value)}
                        />
                    </Field>
                    <Field
                        holdsData={false}
                        label="Description in search"
                        hint={lengthLine(
                            (seoText || fields.excerpt).length,
                            SEARCH_TEXT.aim,
                        )}
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
                                        . When you publish the post, the old
                                        link forwards here.
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
                            text={
                                seoText.trim() || fields.excerpt.trim() || null
                            }
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
        </FormDialog>
    );
}
