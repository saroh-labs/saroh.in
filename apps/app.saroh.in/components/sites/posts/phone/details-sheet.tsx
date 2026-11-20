"use client";

import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { FormSheet } from "@saroh/ui/form-sheet";
import { OptionSelect } from "@saroh/ui/option-select";
import { Textarea } from "@saroh/ui/textarea";
import { ChevronRight, Globe } from "lucide-react";
import { useState } from "react";

import { SharePreview } from "@/components/sites/pages-area/page-previews";
import { accountSettingsUrl } from "@/lib/accounts";

import { CoverEditor, SHORT_DESCRIPTION_MAX } from "../editor/details-tab";
import type { PostEditorModel } from "../editor/post-model";
import { SearchSheet } from "../editor/search-tab";
import { slugFrom } from "../editor/use-post-draft";

/** The length the board counts against: what a share card shows. */
export const SHORT_DESCRIPTION_AIM = 160;

/**
 * Details on a phone (`blogphone/WXYDetails`), the whole screen: Shows in,
 * Category, Short description (n / 160), Cover, Written by, and Search
 * and sharing as a row that opens its own sheet; then how the link looks
 * on WhatsApp. Cancel drops what was typed; Save writes every field at
 * once and saves the draft, which goes live when you publish. A reader
 * sees every field and changes none (DEC-200 U8).
 */
export function DetailsSheet({
    model,
    open,
    onClose,
    coverOpen,
    onCoverOpen,
}: {
    model: PostEditorModel;
    open: boolean;
    onClose: () => void;
    /** Change cover is open (from the cover on the page, or More). */
    coverOpen: boolean;
    onCoverOpen: (open: boolean) => void;
}) {
    const { data, draft } = model;
    const { fields, set } = draft;
    const writer = !data.readOnly && !data.paused;
    const [categoryId, setCategoryId] = useState(fields.categoryId);
    const [excerpt, setExcerpt] = useState(fields.excerpt);
    const [search, setSearch] = useState(false);
    // A fresh copy each time it opens, so Cancel drops what was typed.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setCategoryId(fields.categoryId);
            setExcerpt(fields.excerpt);
        }
    }
    const dirty =
        categoryId !== fields.categoryId || excerpt !== fields.excerpt;
    return (
        <>
            <FormSheet
                open={open}
                onClose={onClose}
                title="Details"
                description={fields.title.trim() || "New post"}
                dirty={dirty}
                doneOnly={!writer}
                footNote={
                    writer ? "Saved · goes live when you publish" : undefined
                }
                fieldsClassName="gap-3"
                onSubmit={
                    writer
                        ? () => {
                              if (categoryId !== fields.categoryId)
                                  set("categoryId")(categoryId);
                              if (excerpt !== fields.excerpt)
                                  set("excerpt")(excerpt);
                              onClose();
                              // One save for every field, once the draft
                              // holds them (its newest values settle after
                              // this render).
                              if (dirty)
                                  setTimeout(
                                      () => void draft.save({ silent: true }),
                                      0,
                                  );
                          }
                        : undefined
                }
            >
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Shows in" holdsData={false}>
                        <p className="flex h-11 items-center rounded-md border bg-muted px-3 text-sm">
                            Blog
                        </p>
                    </Field>
                    <Field label="Category" holdsData={false}>
                        <OptionSelect
                            aria-label="Post category"
                            value={categoryId}
                            disabled={!writer}
                            onValueChange={setCategoryId}
                            options={[
                                { value: "", label: "None" },
                                ...data.categories.map((c) => ({
                                    value: c.id,
                                    label: c.name,
                                })),
                            ]}
                            className="h-11 w-full min-w-0"
                        />
                    </Field>
                </div>
                <Field
                    label="Short description"
                    holdsData={false}
                    hint={`Shown on the blog and in share cards · ${excerpt.length} / ${SHORT_DESCRIPTION_AIM}`}
                >
                    <Textarea
                        rows={3}
                        maxLength={SHORT_DESCRIPTION_MAX}
                        value={excerpt}
                        readOnly={!writer}
                        onChange={(e) => setExcerpt(e.target.value)}
                    />
                </Field>
                <div className="grid gap-1.5">
                    <span className="text-sm font-medium">Cover</span>
                    {coverOpen && writer ? (
                        <CoverEditor
                            model={model}
                            onDone={() => onCoverOpen(false)}
                        />
                    ) : (
                        <div className="flex items-center gap-2.5">
                            {fields.image.trim() ? (
                                /* eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL */
                                <img
                                    src={fields.image}
                                    alt=""
                                    className="h-12 w-[72px] shrink-0 rounded-md border object-cover"
                                />
                            ) : null}
                            <span className="min-w-0 flex-1 text-[0.8125rem] text-muted-foreground">
                                {fields.image.trim()
                                    ? fields.imageAlt.trim()
                                        ? `${fields.imageAlt.trim()} · photo described`
                                        : "Photo not described"
                                    : "No cover"}
                            </span>
                            {writer ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 shrink-0"
                                    aria-label="Change cover"
                                    onClick={() => onCoverOpen(true)}
                                >
                                    {fields.image.trim() ? "Change" : "Add"}
                                </Button>
                            ) : null}
                        </div>
                    )}
                </div>
                <div className="grid gap-1">
                    <span className="text-sm font-medium">Written by</span>
                    <p className="text-sm">{data.author ?? "You"}</p>
                    {/* Said where it comes from (UX-091): the writer's own
                        account name, shown on the public post. */}
                    {writer ? (
                        <small className="text-xs text-muted-foreground">
                            Your account name.{" "}
                            <a
                                href={accountSettingsUrl}
                                className="underline underline-offset-2"
                            >
                                Change your name
                            </a>
                        </small>
                    ) : null}
                </div>
                {writer ? (
                    <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => setSearch(true)}
                        className="flex min-h-[60px] w-full items-center gap-3 rounded-xl border bg-card px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Globe aria-hidden className="size-5 shrink-0" />
                        <span className="min-w-0 flex-1">
                            <b className="block text-sm font-semibold">
                                Search and sharing
                            </b>
                            <span className="block truncate text-[0.8125rem] text-muted-foreground">
                                Page link, Google and WhatsApp
                            </span>
                        </span>
                        <ChevronRight aria-hidden className="size-[18px]" />
                    </button>
                ) : (
                    <div className="flex min-h-[60px] w-full items-center gap-3 rounded-xl border bg-card px-3 text-left">
                        <Globe aria-hidden className="size-5 shrink-0" />
                        <span className="min-w-0 flex-1">
                            <b className="block text-sm font-semibold">
                                Search and sharing
                            </b>
                            <span className="block truncate text-[0.8125rem] text-muted-foreground">
                                Page link: /{data.postsPrefix}/
                                {fields.slug.trim() || slugFrom(fields.title)}
                            </span>
                        </span>
                    </div>
                )}
                <div
                    aria-label="Preview: shared on WhatsApp"
                    className="rounded-xl border bg-muted p-2.5"
                >
                    <SharePreview
                        image={fields.image.trim() || null}
                        title={fields.title}
                        text={excerpt.trim() || null}
                        host={data.address}
                    />
                </div>
            </FormSheet>
            {writer ? (
                <SearchSheet
                    model={model}
                    open={search}
                    onOpenChange={setSearch}
                    onReplaceCover={() => onCoverOpen(true)}
                />
            ) : null}
        </>
    );
}
