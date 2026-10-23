"use client";

import type { LookId, RenderedGallery } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";
import { useRef, useState } from "react";

import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import type { LightboxPhoto } from "./lightbox";
import { Lightbox } from "./lightbox";
import { FRONT_RING, FRONT_WRAP, said } from "./look-front";
import { OwnerPhotoNote } from "./no-photo";

/**
 * The gallery under a look (DEC-172, plan U7, #1096), as VA05, VD05 and
 * VB05 draw it, desk and phone:
 *
 * - **Folio**: full plates in columns, each at its own shape (three
 *   across on a desk, two on a phone), the caption small under it.
 * - **Quiet**: a grid with air: a wide photo beside a tall one, then
 *   rows of three and a wide one beside two squares, round-cornered;
 *   on a phone the first photo across and the rest two by two.
 * - **Live**: rounded cards in a mosaic of fixed rows (four across on a
 *   desk, two on a phone), the caption on a band over the photo.
 *
 * Every photo is a button that opens it large in the `Lightbox`, a real
 * dialog; closing gives focus back to the photo that was open. A
 * carousel the merchant chose stays a strip that scrolls inside itself
 * (never the page), in the look's corners.
 *
 * No album tabs: photos have no tags in Phase 1 (DEC-172), so a gallery
 * is one set. A merchant's caption placement (DEC-090) is kept: "over"
 * sets it on a band across the photo's foot.
 *
 * With no photos a customer sees nothing (the section hides, DEC-141);
 * the owner's preview says what the photos should be.
 */

export default function LookGallery({
    content,
    look,
    isOwnerPreview = false,
}: {
    content: RenderedGallery;
    look: LookId;
    isOwnerPreview?: boolean;
}) {
    const images = Array.isArray(content.images)
        ? content.images.filter((img) => Boolean(img.src.trim()))
        : [];
    const [open, setOpen] = useState<number | null>(null);
    const tiles = useRef<(HTMLButtonElement | null)[]>([]);

    if (images.length === 0) {
        return isOwnerPreview ? (
            <section className="text-site-fg w-full py-[var(--site-section-padding)]">
                <div className={FRONT_WRAP}>
                    <OwnerPhotoNote
                        isOwnerPreview
                        what={content.imageBrief ?? null}
                        className="min-h-[200px]"
                    />
                </div>
            </section>
        ) : null;
    }

    const carousel = resolveVariant("gallery", content) === "carousel";
    const over = look === "live" || content.captionPlacement === "over";
    const photos: LightboxPhoto[] = images.map((img) => ({
        src: img.src,
        alt: img.alt ?? null,
        caption: img.caption ?? null,
        width: img.width,
        height: img.height,
    }));
    const total = images.length;

    return (
        <section
            data-site-look-gallery={look}
            className="text-site-fg w-full py-[var(--site-section-padding)]"
        >
            <div className={FRONT_WRAP}>
                <ul
                    className={cn(
                        carousel
                            ? "flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3 min-[700px]:gap-6"
                            : LAYOUT[look],
                    )}
                >
                    {images.map((img, i) => {
                        const caption = said(img.caption);
                        const label = `Open photo ${i + 1} of ${total}${
                            caption || img.alt?.trim()
                                ? `: ${caption ?? img.alt?.trim()}`
                                : ""
                        }`;
                        const shape = carousel
                            ? "h-64 w-auto min-[700px]:h-80"
                            : PHOTO[look](i, img);
                        return (
                            <li
                                key={i}
                                data-gallery-tile=""
                                className={cn(
                                    "min-w-0",
                                    carousel
                                        ? "flex-none snap-start"
                                        : TILE[look](i),
                                )}
                            >
                                <figure className="relative m-0 grid h-full content-start gap-2.5">
                                    <button
                                        ref={(el) => {
                                            tiles.current[i] = el;
                                        }}
                                        type="button"
                                        aria-label={label}
                                        aria-haspopup="dialog"
                                        onClick={() => setOpen(i)}
                                        className={cn(
                                            "rounded-site-photo relative block h-full w-full cursor-zoom-in overflow-hidden p-0 active:opacity-90",
                                            FRONT_RING,
                                        )}
                                    >
                                        <img
                                            src={img.src}
                                            alt={img.alt ?? ""}
                                            width={img.width}
                                            height={img.height}
                                            {...siteImage("below", {
                                                src: img.src,
                                                width: img.width,
                                                sizes: SIZES[look],
                                            })}
                                            className={cn(
                                                "rounded-site-photo block object-cover",
                                                shape,
                                            )}
                                        />
                                        {caption && over ? (
                                            <span className="from-site-fg/90 via-site-fg/75 to-site-fg/0 text-site-bg absolute inset-x-0 bottom-0 max-h-[66px] overflow-hidden bg-gradient-to-t px-3 pb-2.5 pt-5 text-left text-[13px] leading-snug [overflow-wrap:anywhere]">
                                                <span className="line-clamp-2">
                                                    {caption}
                                                </span>
                                            </span>
                                        ) : null}
                                    </button>
                                    {caption && !over ? (
                                        <figcaption className={CAPTION[look]}>
                                            {caption}
                                        </figcaption>
                                    ) : null}
                                </figure>
                            </li>
                        );
                    })}
                </ul>
            </div>
            <Lightbox
                photos={photos}
                index={open}
                look={look}
                onIndex={setOpen}
                onClose={(last) => {
                    setOpen(null);
                    // Back to the photo that was open, once the page is
                    // released (an inert element takes no focus).
                    requestAnimationFrame(() => tiles.current[last]?.focus());
                }}
            />
        </section>
    );
}

/** How wide each look draws a photo, for its `sizes`. */
const SIZES: Record<LookId, string> = {
    folio: "(min-width: 700px) 33vw, 50vw",
    quiet: "(min-width: 700px) 66vw, 50vw",
    live: "(min-width: 700px) 50vw, 100vw",
};

/** The set's arrangement per look (VA05, VD05, VB05). */
const LAYOUT: Record<LookId, string> = {
    // Plates in columns, each at its own shape.
    folio: "columns-2 gap-[10px] min-[700px]:columns-3 min-[700px]:gap-6",
    // Two across on a phone, twelve tracks on a desk.
    quiet: "grid grid-cols-2 items-start gap-3 min-[700px]:grid-cols-12 min-[700px]:gap-6",
    // A mosaic of fixed rows: two across on a phone, four on a desk.
    live: "grid grid-flow-row-dense grid-cols-2 auto-rows-[170px] gap-2 min-[700px]:grid-cols-4 min-[700px]:auto-rows-[240px] min-[700px]:gap-3",
};

/*
 * Quiet's desk rhythm, nine photos to a round (VD05): a wide photo beside
 * a tall one, three across, then a wide one beside two squares.
 */
const QUIET_SPAN = [
    "min-[700px]:col-span-8",
    "min-[700px]:col-span-4",
    "min-[700px]:col-span-4",
    "min-[700px]:col-span-4",
    "min-[700px]:col-span-4",
    "min-[700px]:col-span-4",
    "min-[700px]:col-span-6",
    "min-[700px]:col-span-3",
    "min-[700px]:col-span-3",
] as const;
const QUIET_SHAPE = [
    "min-[700px]:aspect-[3/2]",
    "min-[700px]:aspect-[4/5]",
    "min-[700px]:aspect-square",
    "min-[700px]:aspect-[4/5]",
    "min-[700px]:aspect-[3/2]",
    "min-[700px]:aspect-[4/5]",
    "min-[700px]:aspect-[3/2]",
    "min-[700px]:aspect-square",
    "min-[700px]:aspect-[4/5]",
] as const;

/*
 * Live's mosaic (VB05): a large square, two small, a tall one, three
 * small and a wide one; on a phone the first two rows tall.
 */
const LIVE_SPAN = [
    "col-span-2 row-span-2",
    "",
    "",
    "row-span-2",
    "",
    "",
    "",
    "",
    "min-[700px]:col-span-2",
] as const;

const TILE: Record<LookId, (i: number) => string> = {
    folio: () => "mb-[10px] break-inside-avoid min-[700px]:mb-6",
    quiet: (i) =>
        cn(
            // On a phone the first photo goes across.
            i === 0 ? "col-span-2" : undefined,
            QUIET_SPAN[i % QUIET_SPAN.length],
        ),
    live: (i) => LIVE_SPAN[i % LIVE_SPAN.length],
};

const PHOTO: Record<
    LookId,
    (i: number, img: { width?: number; height?: number }) => string
> = {
    // Its own shape: the page holds its room from the photo's own size.
    folio: () => "h-auto w-full",
    quiet: (i) =>
        cn(
            "h-auto w-full",
            i === 0 ? "aspect-[3/2]" : "aspect-[4/5]",
            QUIET_SHAPE[i % QUIET_SHAPE.length],
        ),
    live: () => "h-full w-full",
};

const CAPTION: Record<LookId, string> = {
    folio: "text-site-muted text-[12px] tracking-[0.06em] [overflow-wrap:anywhere]",
    quiet: "text-site-muted text-[13px] [overflow-wrap:anywhere]",
    live: "text-site-muted text-[13px] font-semibold [overflow-wrap:anywhere]",
};
