"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

export interface QuestionImage {
    mediaId: string;
    url: string;
    filename: string;
}

/** How many tiles show before "+n" (board AIImgThread): one big, up to four small, else three. */
export function shownTiles(count: number): { shown: number; more: number } {
    if (count <= 4) return { shown: count, more: 0 };
    return { shown: 3, more: count - 3 };
}

/**
 * A sent message's images, above its words and right-aligned like the
 * question: 1 image 220px wide, 2 to 4 one row of 80px, 5 to 10 three and a
 * "+n" tile. Every thumbnail opens the viewer.
 */
export function QuestionImages({ images }: { images: QuestionImage[] }) {
    const [open, setOpen] = useState<number | null>(null);
    if (!images.length) return null;
    const { shown, more } = shownTiles(images.length);
    const single = images.length === 1;
    return (
        <>
            <ul
                aria-label={`${images.length} ${images.length === 1 ? "image" : "images"} sent`}
                className="m-0 flex max-w-[86%] list-none flex-wrap justify-end gap-1.5 self-end p-0"
            >
                {images.slice(0, shown).map((image, i) => {
                    const last = more > 0 && i === shown - 1;
                    return (
                        <li key={image.mediaId} className="relative">
                            <button
                                type="button"
                                aria-label={
                                    last
                                        ? `${image.filename}, and ${more} more`
                                        : `Open ${image.filename}`
                                }
                                onClick={() => setOpen(i)}
                                className={cn(
                                    "relative block overflow-hidden rounded-xl border border-border p-0",
                                    single ? "w-[220px]" : "size-20",
                                )}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element -- the business's own image, by address */}
                                <img
                                    src={image.url}
                                    alt=""
                                    className={cn(
                                        "block w-full object-cover",
                                        single
                                            ? "h-auto max-h-[260px]"
                                            : "size-20",
                                    )}
                                />
                                {last ? (
                                    <span className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-foreground/55 text-lg font-semibold text-background">
                                        +{more}
                                    </span>
                                ) : null}
                            </button>
                        </li>
                    );
                })}
            </ul>
            <ImageViewer images={images} index={open} onIndex={setOpen} />
        </>
    );
}

/**
 * The image at its size, never cropped; arrows and the strip move between
 * the message's images, ← → and Esc work. A look, not a tool: no edit and
 * no download.
 */
export function ImageViewer({
    images,
    index,
    onIndex,
}: {
    images: QuestionImage[];
    index: number | null;
    onIndex: (i: number | null) => void;
}) {
    const at = index ?? 0;
    useEffect(() => {
        if (index === null) return;
        const move = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight")
                onIndex(Math.min(images.length - 1, at + 1));
            if (e.key === "ArrowLeft") onIndex(Math.max(0, at - 1));
        };
        window.addEventListener("keydown", move);
        return () => window.removeEventListener("keydown", move);
    }, [index, at, images.length, onIndex]);
    const image = images.at(at);
    return (
        <Dialog open={index !== null} onOpenChange={(o) => !o && onIndex(null)}>
            <DialogContent
                phone="full"
                className="max-w-[min(96vw,1100px)] bg-foreground/95 text-background"
            >
                <DialogTitle className="m-0 text-sm font-semibold">
                    {image?.filename}
                </DialogTitle>
                <DialogDescription className="m-0 text-xs text-background/70">
                    {at + 1} of {images.length}
                </DialogDescription>
                {image ? (
                    <div className="flex items-center justify-center gap-2">
                        {images.length > 1 ? (
                            <button
                                type="button"
                                aria-label="Previous image"
                                disabled={at === 0}
                                onClick={() => onIndex(at - 1)}
                                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-background/15 disabled:bg-disabled disabled:text-disabled-foreground"
                            >
                                <ChevronLeft aria-hidden />
                            </button>
                        ) : null}
                        {/* eslint-disable-next-line @next/next/no-img-element -- the business's own image, by address */}
                        <img
                            src={image.url}
                            alt={image.filename}
                            className="max-h-[70dvh] min-w-0 flex-1 object-contain"
                        />
                        {images.length > 1 ? (
                            <button
                                type="button"
                                aria-label="Next image"
                                disabled={at === images.length - 1}
                                onClick={() => onIndex(at + 1)}
                                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-background/15 disabled:bg-disabled disabled:text-disabled-foreground"
                            >
                                <ChevronRight aria-hidden />
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
