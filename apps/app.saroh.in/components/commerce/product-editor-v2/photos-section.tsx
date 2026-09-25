"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { Plus, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MediaThumb } from "@/components/commerce/product-sections/media-thumb";
import { AddressPanel } from "@/components/commerce/product-sections/photos-field";
import { useImageUpload } from "@/components/sites/media-picker";
import { listLibrary } from "@/lib/media/actions";
import type { LibraryItem } from "@/lib/media/service";
import { replaceProductImages } from "@/lib/products/actions";
import type { PhotoDraft } from "@/lib/products/editor-sections";
import {
    isVideo,
    LIMITS,
    MEDIA_ACCEPT,
    mediaCounter,
    mediaCounts,
    mediaFileProblem,
    PHOTOS_FULL_MESSAGE,
    photosFrom,
    photosInput,
    samePhotos,
    VIDEOS_FULL_MESSAGE,
} from "@/lib/products/editor-sections";
import type { ProductDetail } from "@/lib/products/service";

import { useEditor, useSection } from "./editor-state";
import { FieldHelp } from "./fields";
import { SectionCard } from "./section-card";

/** "vitamin-c-serum-1.jpg" from wherever a photo came from. */
function fileName(photo: PhotoDraft): string {
    const tail = photo.url.split("?")[0]?.split("/").at(-1) ?? "";
    return decodeURIComponent(tail) || "Photo";
}

/**
 * The product's photos and videos (up to 15 and 3, #517), in the order
 * customers see them; the first photo is the cover, on the shop and in lists.
 * Move one earlier or later, make a photo the cover, or take one off — which
 * never deletes it from your photos. Add photos from the library or upload a
 * photo or video; a drop onto the grid works on a desk, and the tiles are the
 * way on a phone.
 */
export function PhotosSection({ product }: { product: ProductDetail | null }) {
    const { canWrite, saving } = useEditor();
    // Read-only, or saving: the set on screen is the one being sent.
    const ro = !canWrite || saving.includes("photos");
    const fromProduct = product ? photosFrom(product.images) : [];
    const loadedKey = JSON.stringify(
        fromProduct.map((p) => [p.id, p.url, p.alt]),
    );
    const [base, setBase] = useState<PhotoDraft[]>(fromProduct);
    const [draft, setDraft] = useState<PhotoDraft[]>(fromProduct);
    const [seen, setSeen] = useState(loadedKey);
    if (seen !== loadedKey) {
        // A saved set came back (this section's save, or a refresh).
        setSeen(loadedKey);
        setBase(fromProduct);
        setDraft(fromProduct);
    }
    const [library, setLibrary] = useState(false);
    const [byAddress, setByAddress] = useState(false);
    const [over, setOver] = useState(false);
    const { upload, busy, progress, error, setError } = useImageUpload({
        allowVideo: true,
    });
    const fileRef = useRef<HTMLInputElement>(null);

    const n = draft.length;
    const counts = mediaCounts(draft);
    // Photos full: the library and the address can't add one. Both full:
    // nothing can be uploaded either.
    const full = counts.photos >= LIMITS.photos;
    const allFull = full && counts.videos >= LIMITS.videos;
    const coverIndex = draft.findIndex((p) => !isVideo(p));
    const dirty = !samePhotos(draft, base);

    useSection(
        "photos",
        {
            dirty,
            problem: busy ? "Wait for the upload to finish." : "",
        },
        {
            save: async () => {
                if (!product) return false;
                const res = await replaceProductImages(
                    product.id,
                    photosInput(draft),
                );
                if (!res.ok) {
                    showError(res.error);
                    return false;
                }
                const next = photosFrom(res.data);
                setBase(next);
                setDraft(next);
                return true;
            },
            discard: () => setDraft(base),
            afterCreate: async (productId) => {
                if (draft.length === 0) return true;
                const res = await replaceProductImages(
                    productId,
                    photosInput(draft),
                );
                if (!res.ok) showError(`Photos weren't added: ${res.error}`);
                return res.ok;
            },
        },
    );

    function move(from: number, to: number) {
        const next = [...draft];
        next.splice(to, 0, ...next.splice(from, 1));
        setDraft(next);
    }

    function takeOff(i: number) {
        const before = draft;
        const noun = isVideo(draft[i] ?? {}) ? "Video" : "Photo";
        setDraft(draft.filter((_, j) => j !== i));
        showUndo(`${noun} ${i + 1} taken off. It stays in your photos.`, () =>
            setDraft(before),
        );
    }

    async function addFile(file: File) {
        const problem = mediaFileProblem(file, draft);
        if (problem) {
            setError(problem);
            if (fileRef.current) fileRef.current.value = "";
            return;
        }
        const picked = await upload(file);
        if (fileRef.current) fileRef.current.value = "";
        if (!picked) return;
        const video = picked.kind === "video";
        setDraft((list) => {
            // Checked again: another upload may have filled the set.
            const now = mediaCounts(list);
            if (
                video
                    ? now.videos >= LIMITS.videos
                    : now.photos >= LIMITS.photos
            )
                return list;
            return [
                ...list,
                {
                    mediaId: picked.mediaId ?? null,
                    url: picked.src,
                    alt: "",
                    width: picked.width ?? null,
                    height: picked.height ?? null,
                    creditName: null,
                    creditUrl: null,
                    kind: video ? "video" : "photo",
                    durationSec: picked.durationSec ?? null,
                    posterMediaId: picked.posterMediaId ?? null,
                    posterUrl: picked.posterSrc ?? null,
                },
            ];
        });
    }

    function toggleLibrary(item: LibraryItem) {
        if (ro || !item.url) return;
        const i = draft.findIndex(
            (p) => p.mediaId === item.id || p.url === item.url,
        );
        if (i > -1) {
            setDraft(draft.filter((_, j) => j !== i));
            return;
        }
        if (full) return;
        setDraft([
            ...draft,
            {
                mediaId: item.id,
                url: item.url,
                alt: "",
                width: null,
                height: null,
                creditName: null,
                creditUrl: null,
            },
        ]);
    }

    const tileBtn =
        "inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] border border-border bg-card px-1.5 text-[12px] text-foreground/75 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45 coarse:h-11 coarse:min-w-11";
    const addTile =
        "flex min-h-[134px] flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border-strong p-2 text-center text-[12px] font-semibold disabled:cursor-not-allowed";

    return (
        <SectionCard k="photos" title="Photos and videos">
            <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
                <span className="text-[12.5px] font-medium">
                    {mediaCounter(draft)}
                </span>
                <span className="flex-[1_1_200px] text-[11.5px] text-muted-foreground">
                    The first photo is the cover — on the shop and in lists.
                    Every variant shows the same photos unless it picks its own.
                </span>
            </div>
            <input
                ref={fileRef}
                type="file"
                accept={MEDIA_ACCEPT}
                className="sr-only"
                disabled={ro || busy || allFull}
                aria-label="Choose a photo or video"
                onChange={(e) => {
                    const file = e.target.files?.item(0);
                    if (file) void addFile(file);
                }}
            />
            <div
                onDragOver={(e) => {
                    if (ro || allFull) return;
                    e.preventDefault();
                    setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setOver(false);
                    if (ro || allFull) return;
                    const file = e.dataTransfer.files.item(0);
                    if (file) void addFile(file);
                }}
                className={cn(
                    "grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2.5 rounded-[12px] coarse:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]",
                    over &&
                        "outline-dashed outline-2 outline-offset-4 outline-foreground",
                )}
            >
                {draft.map((photo, i) => {
                    const name = fileName(photo);
                    const video = isVideo(photo);
                    const noun = video ? "video" : "photo";
                    const cover = i === coverIndex;
                    return (
                        <div
                            key={photo.id ?? photo.url}
                            className={cn(
                                "min-w-0 overflow-hidden rounded-[10px] bg-card",
                                cover
                                    ? "border-[1.5px] border-foreground"
                                    : "border border-border",
                            )}
                        >
                            <div className="relative aspect-[4/3] bg-muted">
                                <MediaThumb
                                    item={photo}
                                    alt={
                                        photo.alt ||
                                        (video
                                            ? `${name}, video number ${i + 1}`
                                            : `${name}${cover ? ", the cover" : `, number ${i + 1}`}`)
                                    }
                                />
                                {cover ? (
                                    <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground px-[7px] py-px text-[11px] font-semibold text-background">
                                        Cover
                                    </span>
                                ) : null}
                            </div>
                            <div className="px-[7px] pb-[7px] pt-1.5">
                                {/* The name line is what it shows, typed in
                                    place — for people who can't see it, and
                                    how the editor names it. */}
                                <input
                                    value={photo.alt}
                                    maxLength={LIMITS.alt}
                                    disabled={ro}
                                    onChange={(e) =>
                                        setDraft(
                                            draft.map((p, j) =>
                                                j === i
                                                    ? {
                                                          ...p,
                                                          alt: e.target.value,
                                                      }
                                                    : p,
                                            ),
                                        )
                                    }
                                    placeholder={name}
                                    title={photo.alt || name}
                                    aria-label={`What ${noun} ${i + 1} shows, for people who can't see it`}
                                    className="-mx-1 h-6 w-[calc(100%+0.5rem)] truncate rounded-[5px] border border-transparent bg-transparent px-1 text-[11.5px] font-medium placeholder:font-normal placeholder:text-muted-foreground hover:border-border focus-visible:border-border focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11"
                                />
                                <div className="mt-1 flex gap-[3px] coarse:flex-wrap">
                                    <button
                                        type="button"
                                        className={tileBtn}
                                        disabled={ro || i === 0}
                                        aria-label={`Move ${noun} ${i + 1} earlier`}
                                        onClick={() => move(i, i - 1)}
                                    >
                                        ‹
                                    </button>
                                    <button
                                        type="button"
                                        className={tileBtn}
                                        disabled={ro || i === n - 1}
                                        aria-label={`Move ${noun} ${i + 1} later`}
                                        onClick={() => move(i, i + 1)}
                                    >
                                        ›
                                    </button>
                                    {!video && !cover && canWrite ? (
                                        <button
                                            type="button"
                                            className={tileBtn}
                                            disabled={ro}
                                            aria-label={`Make photo ${i + 1} the cover`}
                                            onClick={() => move(i, 0)}
                                        >
                                            Cover
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        className={cn(
                                            tileBtn,
                                            "ml-auto text-destructive",
                                        )}
                                        disabled={ro}
                                        aria-label={`Take ${noun} ${i + 1} off this product`}
                                        onClick={() => takeOff(i)}
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <button
                    type="button"
                    disabled={ro || full}
                    aria-expanded={library}
                    onClick={() => setLibrary((o) => !o)}
                    className={cn(
                        addTile,
                        ro || full
                            ? "text-muted-foreground/60"
                            : "text-foreground/75 hover:bg-muted/50",
                    )}
                >
                    <Plus aria-hidden className="size-[18px]" strokeWidth={2} />
                    <span>From your photos</span>
                </button>
                <button
                    type="button"
                    disabled={ro || busy || allFull}
                    onClick={() => fileRef.current?.click()}
                    className={cn(
                        addTile,
                        ro || busy || allFull
                            ? "text-muted-foreground/60"
                            : "text-foreground/75 hover:bg-muted/50",
                    )}
                >
                    <Upload
                        aria-hidden
                        className="size-[18px]"
                        strokeWidth={2}
                    />
                    <span>
                        {busy
                            ? `Uploading ${progress ?? 0}%`
                            : "Upload a photo or video"}
                    </span>
                </button>
            </div>
            <FieldHelp
                className="mt-2"
                tone={full || allFull ? "warn" : "quiet"}
            >
                {allFull
                    ? `${LIMITS.photos} photos and ${LIMITS.videos} videos is the most. Take one off to add another.`
                    : full
                      ? PHOTOS_FULL_MESSAGE
                      : counts.videos >= LIMITS.videos
                        ? VIDEOS_FULL_MESSAGE
                        : "Photos up to 8 MB, videos up to 50 MB (MP4 or MOV). Drop one onto the grid, or use the tiles."}
            </FieldHelp>
            {busy ? (
                <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress ?? 0}
                    aria-label="Upload progress"
                    className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted"
                >
                    <div
                        className="h-full rounded-full bg-foreground"
                        style={{ width: `${progress ?? 0}%` }}
                    />
                </div>
            ) : null}
            {error ? (
                <div
                    role="alert"
                    className="mt-[9px] text-pretty rounded-[9px] bg-destructive-subtle px-3 py-2.5 text-[12px] leading-[1.5] text-destructive"
                >
                    {error}
                </div>
            ) : null}
            {canWrite && !full ? (
                <button
                    type="button"
                    disabled={ro}
                    aria-expanded={byAddress}
                    onClick={() => setByAddress((o) => !o)}
                    className="mt-1 text-[11.5px] text-brand hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 coarse:min-h-11"
                >
                    {byAddress ? "Close" : "Or add one by its address"}
                </button>
            ) : null}
            {byAddress && !full && !ro ? (
                <div className="mt-2">
                    <AddressPanel
                        onAdd={(url, alt) => {
                            setDraft((list) =>
                                mediaCounts(list).photos >= LIMITS.photos
                                    ? list
                                    : [
                                          ...list,
                                          {
                                              url,
                                              alt,
                                              width: null,
                                              height: null,
                                              creditName: null,
                                              creditUrl: null,
                                          },
                                      ],
                            );
                            setByAddress(false);
                        }}
                    />
                </div>
            ) : null}
            {library ? (
                <LibraryPanel
                    chosen={draft}
                    full={full}
                    onToggle={toggleLibrary}
                    onDone={() => setLibrary(false)}
                />
            ) : null}
        </SectionCard>
    );
}

function LibraryPanel({
    chosen,
    full,
    onToggle,
    onDone,
}: {
    chosen: PhotoDraft[];
    full: boolean;
    onToggle: (item: LibraryItem) => void;
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
        <div className="mt-3 rounded-[10px] bg-muted/50 p-3">
            <div className="mb-2.5 flex items-center gap-2.5">
                <span className="flex-1 text-[12.5px] font-semibold">
                    Your photos · tap to add or take off
                </span>
                <button
                    type="button"
                    onClick={onDone}
                    className="h-7 rounded-[7px] bg-foreground px-[11px] text-[12px] font-semibold text-background hover:bg-foreground/90 coarse:h-11"
                >
                    Done
                </button>
            </div>
            {items === "loading" ? (
                <p role="status" className="text-[12px] text-muted-foreground">
                    Loading your photos…
                </p>
            ) : items === null ? (
                <p role="alert" className="text-[12px] text-destructive">
                    Couldn&apos;t load your photos. Close this and try again, or
                    upload one.
                </p>
            ) : items.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                    No photos in your library yet — upload one.
                </p>
            ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
                    {items.map((item) => {
                        const on = chosen.some(
                            (p) => p.mediaId === item.id || p.url === item.url,
                        );
                        const off = !on && full;
                        return (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    aria-pressed={on}
                                    disabled={off}
                                    onClick={() => onToggle(item)}
                                    aria-label={`${item.filename}${on ? ", on this product. Take it off." : ". Add it."}`}
                                    className={cn(
                                        "w-full overflow-hidden rounded-[8px] bg-card text-left disabled:cursor-not-allowed disabled:opacity-50",
                                        on
                                            ? "border-[1.5px] border-foreground"
                                            : "border border-border",
                                    )}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos */}
                                    <img
                                        src={item.url ?? ""}
                                        alt=""
                                        className="aspect-[4/3] w-full object-cover"
                                    />
                                    <span className="block truncate px-1.5 py-[5px] text-[11px]">
                                        {item.filename}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
