"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { cn } from "@saroh/ui/lib/utils";
import type { Editor } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";
import {
    ArrowDownToLine,
    ChevronDown,
    Eye,
    History,
    ImageIcon,
    MessageSquare,
    Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { MediaPicker } from "@/components/shared/fields/media-picker";
import { ShareItemButton } from "@/components/shared/share-item/share-item-sheet";
import { insertEmbed } from "@/components/sites/rich-text/embeds/insert-embed";
import {
    ADD_ITEMS,
    insertImage,
} from "@/components/sites/rich-text/writing-menus";
import { formatDateTime } from "@/lib/format/datetime";

import type { PostEditorModel } from "../editor/post-model";

/* On demand: the picker reads Services and Products when it opens. */
const EmbedPicker = dynamic(
    () =>
        import("@/components/sites/rich-text/embeds/embed-picker").then(
            (m) => m.EmbedPicker,
        ),
    { ssr: false },
);

/** The Add sheet's four big tiles' words (`blogphone/WXYAdd`), by item. */
const TILE_WORDS: Record<string, string> = {
    service: "With price and Book now",
    image: "From Photos and files or your phone",
    heading: "Start a new part",
    quote: "A client's words",
};
const TILES = ["service", "image", "heading", "quote"];
const TILE_NAMES: Record<string, string> = {
    service: "Your services",
    image: "Photo",
};

/**
 * Add to the post (`blogphone/WXYAdd`): "Goes where your cursor is".
 * Photo, Heading and Quote as tiles, then More: everything else the "/"
 * menu adds (Product, List, Numbered list, Divider). Your services and
 * Product add a card that reads its price live (U15b); offers, Book now,
 * gallery and video are not built yet.
 */
export function AddMenu({
    editor,
    onDone,
}: {
    editor: Editor | null;
    onDone: () => void;
}) {
    const [more, setMore] = useState(true);
    const [picking, setPicking] = useState<string | null>(null);
    const tiles = ADD_ITEMS.filter((i) => TILES.includes(i.key)).sort(
        (a, b) => TILES.indexOf(a.key) - TILES.indexOf(b.key),
    );
    const rest = ADD_ITEMS.filter((i) => !TILES.includes(i.key));
    function add(key: string) {
        const item = ADD_ITEMS.find((i) => i.key === key);
        if (!editor || !item) return;
        if (!item.run) {
            setPicking(key);
            return;
        }
        item.run(editor);
        onDone();
    }
    if ((picking === "service" || picking === "product") && editor) {
        const kind = picking;
        return (
            <div className="min-h-0 flex-1 overflow-y-auto">
                <EmbedPicker
                    kind={kind}
                    onBack={() => setPicking(null)}
                    onPick={(id) => {
                        insertEmbed(editor, kind, id);
                        setPicking(null);
                        onDone();
                    }}
                />
            </div>
        );
    }
    if (picking && editor) {
        return (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <MediaPicker
                    label="Choose a photo"
                    onPick={(img) => {
                        insertImage(editor, img);
                        setPicking(null);
                        onDone();
                    }}
                />
            </div>
        );
    }
    return (
        <div className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto px-4 pb-4">
            <p className="-mt-1 pb-1.5 text-[0.8125rem] text-muted-foreground">
                Goes where your cursor is
            </p>
            <div className="grid grid-cols-2 gap-2">
                {tiles.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        disabled={!editor}
                        onClick={() => add(t.key)}
                        className="flex h-[84px] min-w-0 flex-col items-start justify-center gap-1.5 rounded-xl border bg-card px-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <t.icon
                            aria-hidden
                            className="size-[22px] text-foreground/80"
                        />
                        <b className="flex items-center gap-1.5 text-[0.9375rem] font-semibold">
                            {TILE_NAMES[t.key] ?? t.label}
                            {t.key === "service" ? (
                                <Badge variant="info" size="sm">
                                    New
                                </Badge>
                            ) : null}
                        </b>
                        <span className="max-w-full truncate text-xs text-muted-foreground">
                            {TILE_WORDS[t.key]}
                        </span>
                    </button>
                ))}
            </div>
            <button
                type="button"
                aria-expanded={more}
                onClick={() => setMore(!more)}
                className="flex h-12 w-full items-center gap-2 px-1 text-left text-[0.9375rem] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span className="flex-1">More</span>
                <ChevronDown
                    aria-hidden
                    className={cn(
                        "size-[18px] transition-transform duration-fast",
                        more && "rotate-180",
                    )}
                />
            </button>
            {more ? (
                <ul className="grid grid-cols-2 gap-x-2">
                    {rest.map((i) => (
                        <li key={i.key} className="min-w-0">
                            <button
                                type="button"
                                disabled={!editor}
                                onClick={() => add(i.key)}
                                className="flex h-12 w-full min-w-0 items-center gap-2.5 border-b px-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <i.icon
                                    aria-hidden
                                    className="size-5 shrink-0 text-foreground/80"
                                />
                                <span className="truncate">{i.label}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

/** One row of the More sheet: a 52px target, a line under its name. */
function Row({
    icon: Icon,
    label,
    sub,
    danger = false,
    onClick,
    expanded,
}: {
    icon: LucideIcon;
    label: string;
    sub?: string;
    danger?: boolean;
    onClick: () => void;
    expanded?: boolean;
}) {
    return (
        <li>
            <button
                type="button"
                aria-expanded={expanded}
                onClick={onClick}
                className={cn(
                    "flex min-h-[52px] w-full items-center gap-3.5 rounded-[10px] px-2 text-left text-[0.9375rem] hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    danger && "text-destructive",
                )}
            >
                <Icon
                    aria-hidden
                    className={cn(
                        "size-5 shrink-0",
                        danger ? "text-destructive" : "text-foreground/80",
                    )}
                />
                <span className="min-w-0 flex-1 py-1.5">
                    {label}
                    {sub ? (
                        <span className="block text-[0.8125rem] text-muted-foreground">
                            {sub}
                        </span>
                    ) : null}
                </span>
            </button>
        </li>
    );
}

/** "Live since 12 Nov, 9:00 am · Read by 214", or where it stands. */
export function thisPostLine(model: PostEditorModel, zone: string): string {
    const { draft, data } = model;
    if (!draft.postId) return "Not saved yet";
    if (!draft.live || !draft.liveAt) return model.status;
    const since = `Live since ${formatDateTime(draft.liveAt, zone)}`;
    return data.readBy === null ? since : `${since} · Read by ${data.readBy}`;
}

/**
 * This post (`blogphone/WXYMore`): where it stands, then Preview,
 * Feedback, Versions (U17), Change cover, Share as a post, Take off the
 * site… and Delete this post…, each of the last two asking first in
 * today's words. A reader gets Preview and Feedback.
 */
export function MoreMenu({
    model,
    onPreview,
    onCover,
    onFeedback,
    onVersions,
    openNotes,
}: {
    model: PostEditorModel;
    onPreview: () => void;
    onCover: (() => void) | null;
    onFeedback: (() => void) | null;
    /** Versions, once U17 builds History. */
    onVersions: (() => void) | null;
    openNotes: number;
}) {
    const zone = useBusinessZone();
    const { draft, data } = model;
    const writer = !data.readOnly;
    const [ask, setAsk] = useState<"takeOff" | "delete" | null>(null);
    const share: ReactNode =
        draft.live && data.share ? (
            <li className="flex min-h-[52px] items-center gap-3.5 px-2">
                <span className="min-w-0 flex-1 text-[0.9375rem]">
                    Share as a post
                    <span className="block text-[0.8125rem] text-muted-foreground">
                        Instagram, Facebook or WhatsApp
                    </span>
                </span>
                <ShareItemButton
                    setup={data.share.setup}
                    className="h-11 border px-3"
                    item={{
                        kind: "post",
                        ref: model.liveCopy?.slug ?? draft.fields.slug,
                        name: draft.fields.title,
                        price: null,
                        url: data.share.url,
                        offerId: null,
                        hasPhoto: Boolean(draft.fields.image.trim()),
                        summary: draft.fields.excerpt,
                    }}
                />
            </li>
        ) : null;
    return (
        <div className="min-h-0 flex-1 overflow-y-auto pb-3.5">
            <p
                data-this-post=""
                className="px-4 pb-2 text-[0.8125rem] text-muted-foreground"
            >
                {thisPostLine(model, zone)}
            </p>
            <ul className="grid px-2 pt-1.5">
                <Row
                    icon={Eye}
                    label="Preview"
                    sub={`See it as a reader${data.address ? ` on ${data.address}` : ""}`}
                    onClick={onPreview}
                />
                {onFeedback ? (
                    <Row
                        icon={MessageSquare}
                        label={
                            openNotes > 0
                                ? `Feedback · ${openNotes} open`
                                : "Feedback"
                        }
                        sub="Notes from your team on this post"
                        onClick={onFeedback}
                    />
                ) : null}
                {onVersions ? (
                    <Row
                        icon={History}
                        label="Versions"
                        sub="Bring back an earlier version"
                        onClick={onVersions}
                    />
                ) : null}
                {onCover ? (
                    <Row
                        icon={ImageIcon}
                        label={
                            draft.fields.image.trim()
                                ? "Change cover"
                                : "Add a cover"
                        }
                        sub="Shown on the blog and when the link is shared"
                        onClick={onCover}
                    />
                ) : null}
                {share}
                {writer && draft.postId && draft.live ? (
                    <Row
                        icon={ArrowDownToLine}
                        label="Take off the site…"
                        sub="Asks first. It stays here as a draft"
                        onClick={() => setAsk("takeOff")}
                    />
                ) : null}
                {writer && draft.postId ? (
                    <>
                        <li
                            aria-hidden
                            className="mx-2 my-1.5 h-px bg-border"
                        />
                        <Row
                            icon={Trash2}
                            label="Delete this post…"
                            danger
                            expanded={ask === "delete"}
                            onClick={() =>
                                setAsk(ask === "delete" ? null : "delete")
                            }
                        />
                    </>
                ) : null}
            </ul>
            {ask === "delete" ? (
                <DeleteCard model={model} onKeep={() => setAsk(null)} />
            ) : null}
            <ConfirmDialog
                open={ask === "takeOff"}
                onOpenChange={(open) => setAsk(open ? "takeOff" : null)}
                title="Take this post off the site?"
                description="It stays here as a draft, and you can publish it again any time. Its link stops working until you do."
                confirmLabel="Take it off"
                keepLabel="Keep it live"
                tone="neutral"
                busyLabel="Taking it off…"
                onConfirm={async () => {
                    await draft.unpublish();
                }}
            />
        </div>
    );
}

/** Today's delete words (`post-more-menu.tsx`), drawn in the sheet. */
export function deleteWords(everLive: boolean): string {
    return everLive
        ? "It comes off the site and out of your posts, and its link stops working for anyone who saved it. To take it down and keep it, use Take off the site instead. This cannot be undone."
        : "It has never been published, so nobody outside your team has seen it. This cannot be undone.";
}

function DeleteCard({
    model,
    onKeep,
}: {
    model: PostEditorModel;
    onKeep: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <div
            role="group"
            aria-labelledby="post-delete-ask"
            className="mx-4 mt-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3"
        >
            <b id="post-delete-ask" className="block text-[0.9375rem]">
                Delete this post?
            </b>
            <p className="mb-2.5 mt-1 text-[0.8125rem] leading-normal text-foreground/80">
                {deleteWords(Boolean(model.draft.liveAt))}
            </p>
            {error ? (
                <p
                    role="alert"
                    className="mb-2.5 text-[0.8125rem] text-destructive"
                >
                    {error}
                </p>
            ) : null}
            <div className="flex gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="h-11 flex-1"
                    onClick={onKeep}
                >
                    Keep post
                </Button>
                <Button
                    type="button"
                    variant="destructive"
                    className="h-11 flex-1"
                    busy={busy}
                    busyLabel="Deleting…"
                    onClick={async () => {
                        setBusy(true);
                        setError(null);
                        const res = await model.draft.remove();
                        setBusy(false);
                        if (res) setError(res.error);
                    }}
                >
                    Delete post
                </Button>
            </div>
        </div>
    );
}
