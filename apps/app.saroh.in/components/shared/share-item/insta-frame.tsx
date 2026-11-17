"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";
import {
    Heart,
    ImageIcon,
    MessageCircle,
    MoreHorizontal,
    Send,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { initialsOf } from "@/lib/qr/pick";
import type { CardSize } from "@/lib/share-item/share";
import { SHARE_WORDS } from "@/lib/share-item/words";

import type { CardImage } from "./use-card-image";

export const ASPECT: Record<CardSize, string> = {
    post: "aspect-[4/5]",
    square: "aspect-square",
    story: "aspect-[9/16]",
};

/** The chosen card's picture, or a skeleton of its shape while it loads. */
export function CardPicture({
    image,
    size,
    name,
}: {
    image: CardImage;
    size: CardSize;
    name: string;
}) {
    return image.state === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element -- the fetched PNG, as a blob
        <img
            src={image.src}
            alt={name}
            data-preview=""
            className={cn("block w-full object-cover", ASPECT[size])}
        />
    ) : (
        <Skeleton className={cn("w-full rounded-none", ASPECT[size])} />
    );
}

/**
 * How the post looks on Instagram (boards BPost*, SBShare*): the business's
 * mark and name, the card, the app's icons and the caption with its link
 * turned into "Link in bio". A drawing, close not exact: the page says each
 * app crops a little. `colour` is the business's own (its site's), drawn
 * as data, never a Saroh token.
 */
export function InstaFrame({
    business,
    colour,
    words,
    picture,
    clamp = false,
    className,
}: {
    business: string;
    colour?: string | null;
    /** The caption's words, without the link. */
    words: string;
    picture: React.ReactNode;
    /** One line and "…", as the feed folds it. */
    clamp?: boolean;
    className?: string;
}) {
    return (
        <figure
            data-insta-frame=""
            className={cn(
                "m-0 overflow-hidden rounded-xl bg-card text-[12.5px] leading-[1.45] text-foreground shadow-lg",
                className,
            )}
        >
            <div className="flex items-center gap-2 px-3 py-2.5">
                <span
                    aria-hidden
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[9.5px] font-bold text-background"
                    style={colour ? { background: colour } : undefined}
                >
                    {initialsOf(business)}
                </span>
                <span data-ph-mask="" className="truncate font-semibold">
                    {business}
                </span>
                <MoreHorizontal
                    aria-hidden
                    className="ml-auto size-4 text-muted-foreground"
                />
            </div>
            {picture}
            <div aria-hidden className="flex gap-3.5 px-3 pt-2.5">
                <Heart className="size-[18px]" />
                <MessageCircle className="size-[18px]" />
                <Send className="size-[18px]" />
            </div>
            <figcaption
                data-ph-mask=""
                className={cn("px-3 pb-3 pt-1.5", clamp && "line-clamp-2")}
            >
                <span className="font-semibold">{business}</span> {words.trim()}{" "}
                <mark className="rounded-[3px] bg-warning-subtle px-0.5 text-foreground">
                    {SHARE_WORDS.linkInBio}
                </mark>
            </figcaption>
        </figure>
    );
}

/** A phone around the post (BDone*, SPayoff*): what it is ready to be. */
export function PhoneFrame({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "w-[250px] shrink-0 rounded-[34px] bg-foreground p-2.5 shadow-xl",
                className,
            )}
        >
            <div className="h-[480px] overflow-hidden rounded-[26px] bg-card">
                {children}
            </div>
        </div>
    );
}

/**
 * A card the API draws, as a thumbnail. One it can't draw (a thing the
 * live site doesn't show after all) is a quiet tile, never a broken image.
 */
export function DrawnCard({
    src,
    className,
    lazy = false,
}: {
    src: string;
    className?: string;
    lazy?: boolean;
}) {
    const [failed, setFailed] = useState<string | null>(null);
    const ref = useRef<HTMLImageElement | null>(null);
    // One that failed before the page woke up never fired onError here.
    useEffect(() => {
        const img = ref.current;
        if (img?.complete && img.naturalWidth === 0) setFailed(src);
    }, [src]);
    if (failed === src) {
        return (
            <span
                data-card-failed=""
                className={cn(
                    "flex items-center justify-center bg-muted text-muted-foreground",
                    className,
                )}
            >
                <ImageIcon aria-hidden className="size-5" />
            </span>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element -- a PNG the API draws
        <img
            ref={ref}
            src={src}
            alt=""
            loading={lazy ? "lazy" : undefined}
            onError={() => setFailed(src)}
            className={cn("object-cover", className)}
        />
    );
}
