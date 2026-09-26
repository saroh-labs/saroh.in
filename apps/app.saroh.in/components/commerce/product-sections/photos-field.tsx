"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { showUndo } from "@saroh/ui/toast";
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Star, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { MediaThumb } from "@/components/commerce/product-sections/media-thumb";
import { MediaPicker } from "@/components/sites/media-picker";
import { listLibrary } from "@/lib/media/actions";
import type { LibraryItem } from "@/lib/media/service";
import type { PhotoDraft } from "@/lib/products/editor-sections";
import {
    isVideo,
    LIMITS,
    mediaCounter,
    mediaCounts,
    mediaFileProblem,
} from "@/lib/products/editor-sections";

/**
 * A product's photos and videos, in the order customers see them (the
 * product page's photo sheet). The first photo is the cover. Move one
 * earlier or later, make a photo the cover, write what it shows for people
 * who can't see it, or take it off — which never deletes it from the library.
 *
 * Browse is the control; nothing here needs a drop target, so it works the
 * same on a phone. Add from the library, upload, or paste an address.
 */
export function PhotosField({
    value,
    onChange,
    disabled = false,
}: {
    value: PhotoDraft[];
    onChange: (next: PhotoDraft[]) => void;
    disabled?: boolean;
}) {
    const counts = mediaCounts(value);
    // Photos full: the library and an address can't add one; both full:
    // nothing can be uploaded either.
    const full = counts.photos >= LIMITS.photos;
    const allFull = full && counts.videos >= LIMITS.videos;
    const coverIndex = value.findIndex((p) => !isVideo(p));
    const [adding, setAdding] = useState<"library" | "address" | null>(null);

    function move(from: number, to: number) {
        const next = [...value];
        next.splice(to, 0, ...next.splice(from, 1));
        onChange(next);
    }

    function takeOff(index: number) {
        const before = value;
        onChange(value.filter((_, i) => i !== index));
        showUndo(
            `Photo taken off. It stays in your photos until you save.`,
            () => onChange(before),
        );
    }

    function add(photo: PhotoDraft) {
        const now = mediaCounts(value);
        if (
            isVideo(photo)
                ? now.videos >= LIMITS.videos
                : now.photos >= LIMITS.photos
        )
            return;
        onChange([...value, photo]);
    }

    return (
        <div className="flex flex-col gap-3">
            <p className="text-[12.5px] text-muted-foreground">
                {mediaCounter(value)}. The first photo is the cover — on the
                shop and in lists. Every variant shows the same photos unless it
                picks one of its own.
            </p>

            {value.length > 0 ? (
                <ol className="flex flex-col gap-2">
                    {value.map((photo, i) => {
                        const video = isVideo(photo);
                        const noun = video ? "video" : "photo";
                        return (
                            <li
                                key={photo.id ?? photo.url}
                                className={cn(
                                    "flex flex-wrap items-start gap-3 rounded-[10px] border p-2",
                                    i === coverIndex
                                        ? "border-foreground"
                                        : "border-border",
                                )}
                            >
                                <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                                    <MediaThumb item={photo} alt="" small />
                                </div>
                                <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {i === coverIndex ? (
                                            <Badge variant="neutral">
                                                Cover
                                            </Badge>
                                        ) : null}
                                        {photo.creditName ? (
                                            <span className="truncate text-[11.5px] text-muted-foreground">
                                                Photo: {photo.creditName}
                                            </span>
                                        ) : null}
                                    </div>
                                    <Input
                                        value={photo.alt}
                                        maxLength={LIMITS.alt}
                                        disabled={disabled}
                                        onChange={(e) =>
                                            onChange(
                                                value.map((p, j) =>
                                                    j === i
                                                        ? {
                                                              ...p,
                                                              alt: e.target
                                                                  .value,
                                                          }
                                                        : p,
                                                ),
                                            )
                                        }
                                        placeholder="What it shows, for people who can't see it"
                                        aria-label={`Description of ${noun} ${i + 1}`}
                                        className="h-9"
                                    />
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    <IconButton
                                        label={`Move ${noun} ${i + 1} earlier`}
                                        disabled={disabled || i === 0}
                                        onClick={() => move(i, i - 1)}
                                    >
                                        <ArrowLeft />
                                    </IconButton>
                                    <IconButton
                                        label={`Move ${noun} ${i + 1} later`}
                                        disabled={
                                            disabled || i === value.length - 1
                                        }
                                        onClick={() => move(i, i + 1)}
                                    >
                                        <ArrowRight />
                                    </IconButton>
                                    {!video && i !== coverIndex ? (
                                        <IconButton
                                            label={`Make photo ${i + 1} the cover`}
                                            disabled={disabled}
                                            onClick={() => move(i, 0)}
                                        >
                                            <Star />
                                        </IconButton>
                                    ) : null}
                                    <IconButton
                                        label={`Take ${noun} ${i + 1} off this product`}
                                        disabled={disabled}
                                        onClick={() => takeOff(i)}
                                        danger
                                    >
                                        <X />
                                    </IconButton>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            ) : (
                <div className="rounded-[10px] border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
                    No photos yet. Add up to {LIMITS.photos} photos and{" "}
                    {LIMITS.videos} videos.
                </div>
            )}

            {allFull ? (
                <p className="text-[12.5px] text-brand-subtle-foreground">
                    Full: {LIMITS.photos} photos and {LIMITS.videos} videos is
                    the most. Take one off to add another.
                </p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || full}
                        aria-expanded={adding === "library"}
                        onClick={() =>
                            setAdding(adding === "library" ? null : "library")
                        }
                    >
                        <ImagePlus aria-hidden />
                        From your photos
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || full}
                        aria-expanded={adding === "address"}
                        onClick={() =>
                            setAdding(adding === "address" ? null : "address")
                        }
                    >
                        <Link2 aria-hidden />
                        By address
                    </Button>
                    <MediaPicker
                        label="Upload a photo or video"
                        allowVideo
                        check={(file) => mediaFileProblem(file, value)}
                        onPick={(img) =>
                            add({
                                mediaId: img.mediaId ?? null,
                                url: img.src,
                                alt: "",
                                width: img.width ?? null,
                                height: img.height ?? null,
                                creditName: null,
                                creditUrl: null,
                                kind: img.kind === "video" ? "video" : "photo",
                                durationSec: img.durationSec ?? null,
                                posterMediaId: img.posterMediaId ?? null,
                                posterUrl: img.posterSrc ?? null,
                            })
                        }
                    />
                </div>
            )}

            {adding === "library" && !full ? (
                <LibraryPanel
                    taken={new Set(value.map((p) => p.url))}
                    onPick={(item) => {
                        add({
                            mediaId: item.id,
                            url: item.url ?? "",
                            alt: "",
                            width: null,
                            height: null,
                            creditName: null,
                            creditUrl: null,
                        });
                    }}
                    onDone={() => setAdding(null)}
                />
            ) : null}
            {adding === "address" && !full ? (
                <AddressPanel
                    onAdd={(url, alt) => {
                        add({
                            url,
                            alt,
                            width: null,
                            height: null,
                            creditName: null,
                            creditUrl: null,
                        });
                        setAdding(null);
                    }}
                />
            ) : null}
        </div>
    );
}

function IconButton({
    label,
    disabled,
    onClick,
    danger,
    children,
}: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    danger?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "grid size-8 place-items-center rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 coarse:size-11 [&_svg]:size-4",
                danger
                    ? "text-destructive hover:bg-destructive-subtle"
                    : "hover:bg-muted",
            )}
        >
            {children}
        </button>
    );
}

function LibraryPanel({
    taken,
    onPick,
    onDone,
}: {
    taken: Set<string>;
    onPick: (item: LibraryItem) => void;
    onDone: () => void;
}) {
    const [items, setItems] = useState<LibraryItem[] | null | "loading">(
        "loading",
    );
    // Read once, when the panel opens.
    useEffect(() => {
        let live = true;
        void listLibrary().then((list) => {
            if (live) setItems(list);
        });
        return () => {
            live = false;
        };
    }, []);
    return (
        <div className="rounded-[10px] bg-muted p-3">
            <div className="mb-2 flex items-center justify-between">
                <p className="text-[12.5px] font-medium">
                    Your photos · tap to add
                </p>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onDone}
                >
                    Done
                </Button>
            </div>
            {items === "loading" ? (
                <p
                    role="status"
                    className="text-[12.5px] text-muted-foreground"
                >
                    Loading your photos…
                </p>
            ) : items === null ? (
                <p role="alert" className="text-[12.5px] text-destructive">
                    Couldn&apos;t load your photos. Close this and try again, or
                    add one by address.
                </p>
            ) : items.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                    No photos in your library yet — upload one, or add one by
                    address.
                </p>
            ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
                    {items.map((item) => {
                        const on = item.url !== null && taken.has(item.url);
                        return (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    disabled={on}
                                    onClick={() => onPick(item)}
                                    aria-label={
                                        on
                                            ? `${item.filename}, already on this product`
                                            : `${item.filename}. Add it.`
                                    }
                                    className="w-full overflow-hidden rounded-md border border-border disabled:opacity-45"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos */}
                                    <img
                                        src={item.url ?? ""}
                                        alt=""
                                        className="aspect-[4/3] w-full object-cover"
                                    />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export function AddressPanel({
    onAdd,
}: {
    onAdd: (url: string, alt: string) => void;
}) {
    const id = useId();
    const [url, setUrl] = useState("");
    const [alt, setAlt] = useState("");
    const valid = /^https:\/\/\S+$/.test(url.trim());
    return (
        <div className="flex flex-col gap-2 rounded-[10px] bg-muted p-3">
            <label htmlFor={`${id}-url`} className="text-[12.5px] font-medium">
                Photo address
            </label>
            <Input
                id={`${id}-url`}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://images.example.com/photo.jpg"
                className="font-mono text-[12px]"
            />
            <label htmlFor={`${id}-alt`} className="text-[12.5px] font-medium">
                What it shows
            </label>
            <Input
                id={`${id}-alt`}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
            />
            <p className="text-[12px] text-muted-foreground">
                {url && !valid
                    ? "An address starts with https://."
                    : "The shop shows it from that address."}
            </p>
            <div>
                <Button
                    type="button"
                    size="sm"
                    disabled={!valid}
                    onClick={() => onAdd(url.trim(), alt.trim())}
                >
                    Add photo
                </Button>
            </div>
        </div>
    );
}
