"use client";

import { ASK_AI_IMAGES_MAX } from "@saroh/api-contract";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { FailedRead } from "@saroh/ui/failed-read";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";
import {
    Camera,
    Check,
    ImagePlus,
    Images,
    Monitor,
    TriangleAlert,
    X,
} from "lucide-react";
import type { DragEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { Attachment, BoxLine } from "@/lib/ask-ai/images";
import { ONE_MESSAGE_WORDS } from "@/lib/ask-ai/images";
import { listLibrary } from "@/lib/media/actions";
import type { LibraryItem } from "@/lib/media/service";
import { PROVIDER_WHERE } from "./words";

/** What the file pickers offer; AVIF is left out, Ask AI's provider can't read it. */
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/** The thumbnails above the words: 64px, a dark × to remove, a veil and a bar while one goes up. */
export function AttachStrip({
    items,
    onRemove,
}: {
    items: readonly Attachment[];
    onRemove: (key: string) => void;
}) {
    if (!items.length) return null;
    return (
        <ul
            aria-label="Images in this message"
            className="m-0 flex list-none flex-wrap gap-2 p-0 pb-1 pr-2 pt-2"
        >
            {items.map((a) => (
                <li
                    key={a.key}
                    data-attachment={a.status}
                    className={cn(
                        "relative size-16 shrink-0 overflow-hidden rounded-[10px] border border-border bg-muted",
                        a.status === "failed" &&
                            "border-[1.5px] border-destructive",
                    )}
                >
                    {a.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a local preview or the business's own photo
                        <img
                            src={a.preview}
                            alt=""
                            className="size-full object-cover"
                        />
                    ) : null}
                    {a.status === "uploading" ? (
                        <>
                            <span className="absolute inset-0 bg-background/60" />
                            <span
                                role="progressbar"
                                aria-label={`Uploading ${a.name}`}
                                aria-valuenow={a.progress}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                className="absolute inset-x-[7px] bottom-[7px] h-1 rounded-sm bg-foreground/20"
                            >
                                <i
                                    className="block h-full rounded-sm bg-foreground"
                                    style={{ width: `${a.progress}%` }}
                                />
                            </span>
                        </>
                    ) : null}
                    {a.status === "failed" ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-destructive-subtle/85 text-destructive-subtle-foreground">
                            <TriangleAlert className="size-5" aria-hidden />
                        </span>
                    ) : null}
                    <button
                        type="button"
                        aria-label={`Remove ${a.name}`}
                        onClick={() => onRemove(a.key)}
                        // 28px to see, 44px under a thumb to press.
                        className="absolute right-0 top-0 inline-flex size-7 items-center justify-center rounded-full p-0 coarse:size-11"
                    >
                        <span className="inline-flex size-5 items-center justify-center rounded-full bg-foreground/80 text-background">
                            <X className="size-3" aria-hidden />
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

/** The one line inside the box, under the thumbnails. */
export function BoxLineView({
    line,
    onRetry,
    onRemove,
}: {
    line: BoxLine | null;
    onRetry: (key: string) => void;
    onRemove: (key: string) => void;
}) {
    if (!line) return null;
    const bad = line.kind === "failed" || line.kind === "problem";
    return (
        <p
            role={bad ? "alert" : "status"}
            className={cn(
                "m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 pr-2 text-[13px] leading-[18px]",
                bad
                    ? "text-destructive-subtle-foreground"
                    : "text-neutral-700 dark:text-foreground",
            )}
        >
            <span data-ph-unmask="">{line.words}</span>
            {line.kind === "failed" ? (
                <>
                    <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-7 px-0.5 underline"
                        onClick={() => onRetry(line.key)}
                    >
                        Try again
                    </Button>
                    <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-7 px-0.5 underline"
                        onClick={() => onRemove(line.key)}
                    >
                        Remove it
                    </Button>
                </>
            ) : null}
        </p>
    );
}

/**
 * Add images: + at the box's foot. On a desk it opens Upload from this
 * computer and From your photos; on a phone, Take a photo, Choose from this
 * phone and From your photos. The one provider line lives here, and nowhere
 * else (owner, 22 Nov).
 */
export function AddImages({
    full,
    disabled,
    phone,
    onFiles,
    onLibrary,
}: {
    full: boolean;
    disabled: boolean;
    phone: boolean;
    onFiles: (files: File[]) => void;
    onLibrary: (items: LibraryItem[]) => void;
}) {
    const pick = useRef<HTMLInputElement>(null);
    const camera = useRef<HTMLInputElement>(null);
    const [library, setLibrary] = useState(false);
    const read = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        // The same file may be chosen again after a failure.
        e.target.value = "";
        if (files.length) onFiles(files);
    };
    return (
        <>
            <input
                ref={pick}
                type="file"
                accept={ACCEPT}
                multiple
                hidden
                data-ask-ai-images=""
                aria-label="Choose images"
                onChange={read}
            />
            <input
                ref={camera}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                aria-label="Take a photo"
                onChange={read}
            />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <IconButton
                        label={full ? ONE_MESSAGE_WORDS : "Add images"}
                        icon={<ImagePlus />}
                        variant="ghost"
                        size="md"
                        disabled={disabled || full}
                        className="size-9 coarse:size-11 [&_svg]:size-[18px]"
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    side="top"
                    className="w-[280px] p-1.5"
                >
                    {phone ? (
                        <>
                            <DropdownMenuItem
                                className="h-11"
                                onSelect={() => camera.current?.click()}
                            >
                                <Camera aria-hidden /> Take a photo
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="h-11"
                                onSelect={() => pick.current?.click()}
                            >
                                <Monitor aria-hidden /> Choose from this phone
                            </DropdownMenuItem>
                        </>
                    ) : (
                        <DropdownMenuItem
                            className="h-10"
                            onSelect={() => pick.current?.click()}
                        >
                            <Monitor aria-hidden /> Upload from this computer
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        className={phone ? "h-11" : "h-10"}
                        onSelect={() => setLibrary(true)}
                    >
                        <Images aria-hidden /> From your photos
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <p
                        data-ph-unmask=""
                        className="m-0 px-2.5 pb-1.5 pt-1 text-xs leading-normal text-muted-foreground"
                    >
                        {phone
                            ? `Up to ${ASK_AI_IMAGES_MAX} in one message. `
                            : "Or paste (⌘V), or drop images on this panel. "}
                        JPG, PNG, WebP or GIF, up to 5 MB each.
                    </p>
                    <p
                        data-ph-unmask=""
                        className="m-0 px-2.5 pb-1.5 text-xs leading-normal text-muted-foreground"
                    >
                        {providerLine()}
                    </p>
                </DropdownMenuContent>
            </DropdownMenu>
            {library ? (
                <LibraryPicker
                    onDone={(chosen) => {
                        setLibrary(false);
                        if (chosen.length) onLibrary(chosen);
                    }}
                />
            ) : null}
        </>
    );
}

/** The one provider line, said once, where images are chosen. */
export const providerLine = () =>
    `Ask AI's provider reads the images you add${PROVIDER_WHERE}.`;

/**
 * "From your photos": the business's library, read when it opens, to pick
 * several at once (many at once, unlike the product editor's one).
 */
function LibraryPicker({
    onDone,
}: {
    onDone: (chosen: LibraryItem[]) => void;
}) {
    const [items, setItems] = useState<LibraryItem[] | null | "loading">(
        "loading",
    );
    const [chosen, setChosen] = useState<string[]>([]);
    // Read when the picker opens, and again on Try again.
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let live = true;
        void listLibrary().then((list) => {
            if (live) setItems(list);
        });
        return () => {
            live = false;
        };
    }, [attempt]);
    const list = Array.isArray(items) ? items : [];
    return (
        <Dialog open onOpenChange={(o) => !o && onDone([])}>
            <DialogContent size="sm">
                <DialogTitle>From your photos</DialogTitle>
                <DialogDescription className="sr-only">
                    Choose one or more photos from your library.
                </DialogDescription>
                <div className="mb-2.5 flex items-center gap-2.5">
                    <span
                        data-ph-unmask=""
                        className="flex-1 text-[12.5px] font-semibold"
                    >
                        Your photos · tap to choose
                    </span>
                    <Button
                        size="xs"
                        type="button"
                        data-ph-unmask=""
                        onClick={() =>
                            onDone(list.filter((i) => chosen.includes(i.id)))
                        }
                    >
                        {chosen.length ? `Add ${chosen.length}` : "Done"}
                    </Button>
                </div>
                {items === "loading" ? (
                    <div role="status" aria-busy="true" className="flex gap-2">
                        <Skeleton aria-hidden className="size-16" />
                        <Skeleton aria-hidden className="size-16" />
                        <Skeleton aria-hidden className="size-16" />
                    </div>
                ) : items === null ? (
                    <FailedRead
                        things="your photos"
                        reassurance="You can still upload one."
                        onRetry={() => setAttempt((n) => n + 1)}
                    />
                ) : list.length === 0 ? (
                    <EmptyState
                        size="inline"
                        title="No photos in your library yet"
                        description="Upload one."
                    />
                ) : (
                    <ul className="m-0 flex max-h-44 list-none flex-wrap gap-2 overflow-y-auto p-0">
                        {list.map((i) => {
                            const on = chosen.includes(i.id);
                            return (
                                <li key={i.id}>
                                    <button
                                        type="button"
                                        aria-pressed={on}
                                        aria-label={i.filename}
                                        onClick={() =>
                                            setChosen((all) =>
                                                on
                                                    ? all.filter(
                                                          (x) => x !== i.id,
                                                      )
                                                    : [...all, i.id],
                                            )
                                        }
                                        className={cn(
                                            "relative block size-16 overflow-hidden rounded-[10px] border border-border p-0",
                                            on && "ring-2 ring-foreground",
                                        )}
                                    >
                                        {i.url ? (
                                            // eslint-disable-next-line @next/next/no-img-element -- the business's own photo
                                            <img
                                                src={i.url}
                                                alt=""
                                                className="size-full object-cover"
                                            />
                                        ) : null}
                                        {on ? (
                                            <span className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                                                <Check
                                                    className="size-3"
                                                    aria-hidden
                                                />
                                            </span>
                                        ) : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}

/**
 * Drop images anywhere on a part of the panel: the props to spread on it,
 * and whether files are being dragged over it now.
 */
export function useDropImages(onFiles: (files: File[]) => void, off = false) {
    const [over, setOver] = useState(false);
    const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");
    return {
        over: over && !off,
        props: {
            onDragOver: (e: DragEvent) => {
                if (off || !hasFiles(e)) return;
                e.preventDefault();
                setOver(true);
            },
            onDragLeave: (e: DragEvent) => {
                // Leaving to a child of the same area isn't leaving.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setOver(false);
                }
            },
            onDrop: (e: DragEvent) => {
                setOver(false);
                if (off || !hasFiles(e)) return;
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files);
                if (files.length) onFiles(files);
            },
        },
    };
}
