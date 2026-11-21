"use client";

import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { OptionSelect } from "@saroh/ui/option-select";
import { Segmented } from "@saroh/ui/segmented";
import { Textarea } from "@saroh/ui/textarea";
import { Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { MediaPicker } from "@/components/shared/fields/media-picker";
import { ShareItemButton } from "@/components/shared/share-item/share-item-sheet";
import { accountSettingsUrl } from "@/lib/accounts";
import { formatDateTime } from "@/lib/format/datetime";

import type { PostEditorModel } from "./post-model";

/** The API's limits (`content/dto.ts`): a typed limit, never a plan's. */
export const SHORT_DESCRIPTION_MAX = 500;
export const COVER_DESCRIPTION_MAX = 300;

/** The row a Change opened, or none. */
export type DetailsRow = "category" | "excerpt" | "cover" | null;

/**
 * Inspector › Details (`blogdesk/WXWWrite`): each row read first, with
 * Change. Shows in, Category, Short description, Cover, Written by; then
 * where the page link is, and the live card with Share as a post.
 */
export function DetailsTab({
    model,
    editing,
    onEditing,
}: {
    model: PostEditorModel;
    editing: DetailsRow;
    onEditing: (row: DetailsRow) => void;
}) {
    const zone = useBusinessZone();
    const { data, draft } = model;
    const { fields, set } = draft;
    const writer = !data.readOnly && !data.paused;
    const category = data.categories.find((c) => c.id === fields.categoryId);
    const count = data.posts?.length ?? null;
    return (
        <div className="grid gap-4">
            <dl className="grid">
                <Row label="Shows in">
                    Blog
                    <small>
                        {data.address ?? ""}/{data.postsPrefix}
                        {count === null
                            ? ""
                            : ` · ${count} ${count === 1 ? "post" : "posts"}`}
                    </small>
                </Row>
                <Row
                    label="Category"
                    change={writer ? () => onEditing("category") : undefined}
                    open={editing === "category"}
                    editor={
                        <OptionSelect
                            aria-label="Post category"
                            value={fields.categoryId}
                            onValueChange={(v) => {
                                set("categoryId")(v);
                                onEditing(null);
                            }}
                            options={[
                                { value: "", label: "None" },
                                ...data.categories.map((c) => ({
                                    value: c.id,
                                    label: c.name,
                                })),
                            ]}
                            className="w-full"
                        />
                    }
                >
                    {category?.name ?? "None"}
                </Row>
                <Row
                    label="Short description"
                    change={writer ? () => onEditing("excerpt") : undefined}
                    open={editing === "excerpt"}
                    editor={
                        <div className="grid gap-1.5">
                            <Textarea
                                autoFocus
                                rows={4}
                                maxLength={SHORT_DESCRIPTION_MAX}
                                value={fields.excerpt}
                                onChange={(e) => set("excerpt")(e.target.value)}
                                aria-label="Short description"
                            />
                            <small className="text-xs text-muted-foreground">
                                Shown on the blog and in share cards ·{" "}
                                {fields.excerpt.length} of{" "}
                                {SHORT_DESCRIPTION_MAX}
                            </small>
                            <Done onClick={() => onEditing(null)} />
                        </div>
                    }
                >
                    {fields.excerpt.trim() || (
                        <span className="text-muted-foreground">None yet</span>
                    )}
                    <small>Shown on the blog and in share cards</small>
                </Row>
                <Row
                    label="Cover"
                    change={writer ? () => onEditing("cover") : undefined}
                    open={editing === "cover"}
                    editor={
                        <CoverEditor
                            model={model}
                            onDone={() => onEditing(null)}
                        />
                    }
                >
                    {fields.image.trim() ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL */}
                            <img
                                src={fields.image}
                                alt={fields.imageAlt}
                                className="mb-1.5 block h-16 w-[120px] rounded-md border object-cover"
                            />
                            {fields.imageAlt.trim()
                                ? "Photo described"
                                : "Photo not described"}
                        </>
                    ) : (
                        <span className="text-muted-foreground">No cover</span>
                    )}
                </Row>
                <Row label="Written by">
                    {data.author ?? "You"}
                    {/* Said where it comes from (UX-091): the writer's own
                        account name, shown on the public post. */}
                    {writer ? (
                        <small>
                            Your account name.{" "}
                            <a
                                href={accountSettingsUrl}
                                className="underline underline-offset-2"
                            >
                                Change your name
                            </a>
                        </small>
                    ) : null}
                </Row>
            </dl>
            <p className="text-[0.8125rem] text-muted-foreground">
                The page link is in Search and sharing.
            </p>
            {draft.postId ? (
                <div className="rounded-xl border bg-muted p-3.5 text-[0.8125rem] leading-normal text-foreground/75">
                    <b className="block text-sm text-foreground">
                        {draft.liveAt
                            ? `Live since ${formatDateTime(draft.liveAt, zone)}`
                            : "Not live yet"}
                    </b>
                    {draft.live && data.readBy !== null ? (
                        <span className="block font-semibold text-success">
                            Read by {data.readBy}
                        </span>
                    ) : null}
                    {draft.live && data.share ? (
                        <div className="mt-2.5">
                            <ShareItemButton
                                setup={data.share.setup}
                                className="border"
                                item={{
                                    kind: "post",
                                    // The saved address, which the live copy has.
                                    ref: model.liveCopy?.slug ?? fields.slug,
                                    name: fields.title,
                                    price: null,
                                    url: data.share.url,
                                    offerId: null,
                                    hasPhoto: Boolean(fields.image.trim()),
                                    summary: fields.excerpt,
                                }}
                            />
                        </div>
                    ) : draft.live ? null : (
                        <span className="mt-1 flex items-center gap-1.5">
                            <Share2 aria-hidden className="size-3.5" />
                            Share as a post once it is live.
                        </span>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function Row({
    label,
    change,
    open = false,
    editor,
    children,
}: {
    label: string;
    /** Absent: read only. */
    change?: () => void;
    open?: boolean;
    editor?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex items-start gap-2.5 border-t py-3 first:border-t-0 first:pt-0">
            <dt className="w-24 shrink-0 pt-0.5 text-[0.8125rem] text-muted-foreground">
                {label}
            </dt>
            <dd className="min-w-0 flex-1 text-sm leading-snug [&_small]:mt-0.5 [&_small]:block [&_small]:text-xs [&_small]:text-muted-foreground">
                {open ? editor : children}
            </dd>
            {change && !open ? (
                <Button
                    type="button"
                    variant="link"
                    size="inline"
                    aria-label={`Change ${label.toLowerCase()}`}
                    onClick={change}
                    className="shrink-0 pt-0.5 text-[0.8125rem] text-foreground underline decoration-border underline-offset-[3px]"
                >
                    Change
                </Button>
            ) : null}
        </div>
    );
}

function Done({ onClick }: { onClick: () => void }) {
    return (
        <Button
            type="button"
            size="xs"
            variant="outline"
            className="justify-self-end"
            onClick={onClick}
        >
            Done
        </Button>
    );
}

/**
 * Change cover (`WXWStates`, "Cover by image address"): Photos and files
 * or an image address, checked by loading it ("Found it · 1600 × 1067"),
 * and Describe the photo. Nothing changes until Use as cover.
 */
export function CoverEditor({
    model,
    onDone,
}: {
    model: PostEditorModel;
    onDone: () => void;
}) {
    const { fields, set } = model.draft;
    const [from, setFrom] = useState<"files" | "address">("files");
    const [src, setSrc] = useState(fields.image);
    const [alt, setAlt] = useState(fields.imageAlt);
    const [found, setFound] = useState<
        { w: number; h: number } | "missing" | null
    >(null);
    return (
        <div className="grid gap-3">
            <Segmented
                label="Where the photo is"
                value={from}
                onValueChange={setFrom}
                block
                options={[
                    { value: "files", label: "Photos and files" },
                    { value: "address", label: "Image address" },
                ]}
            />
            {from === "files" ? (
                <MediaPicker
                    onPick={(img) => {
                        setSrc(img.src);
                        setFound(
                            img.width && img.height
                                ? { w: img.width, h: img.height }
                                : null,
                        );
                    }}
                />
            ) : (
                <Input
                    value={src}
                    onChange={(e) => {
                        setSrc(e.target.value);
                        setFound(null);
                    }}
                    placeholder="https://example.com/photo.jpg"
                    aria-label="Image address"
                />
            )}
            {src.trim() ? (
                <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL */}
                    <img
                        src={src}
                        alt=""
                        onLoad={(e) =>
                            setFound({
                                w: e.currentTarget.naturalWidth,
                                h: e.currentTarget.naturalHeight,
                            })
                        }
                        onError={() => setFound("missing")}
                        className="h-[68px] w-[120px] shrink-0 rounded-md border object-cover"
                    />
                    <span role="status" className="text-[0.8125rem]">
                        {found === "missing"
                            ? "No photo found at that address."
                            : found
                              ? `Found it · ${found.w} × ${found.h}`
                              : "Looking…"}
                    </span>
                </div>
            ) : null}
            <Field
                label="Describe the photo"
                hint="Read aloud to people who can't see it, and by search."
            >
                <Textarea
                    rows={2}
                    maxLength={COVER_DESCRIPTION_MAX}
                    value={alt}
                    onChange={(e) => setAlt(e.target.value)}
                    placeholder="A bride at the mirror during her trial"
                />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
                {fields.image ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mr-auto text-destructive"
                        onClick={() => {
                            set("image")("");
                            set("imageAlt")("");
                            onDone();
                        }}
                    >
                        Remove cover
                    </Button>
                ) : null}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onDone}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    size="sm"
                    disabled={found === "missing"}
                    onClick={() => {
                        if (src.trim() !== fields.image)
                            set("image")(src.trim());
                        if (alt !== fields.imageAlt) set("imageAlt")(alt);
                        onDone();
                    }}
                >
                    Use as cover
                </Button>
            </div>
        </div>
    );
}
