"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Segmented } from "@saroh/ui/segmented";
import { Skeleton } from "@saroh/ui/skeleton";
import { ImageIcon, RotateCw } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useRef } from "react";

import type { CardSize, CardStyle } from "@/lib/share-item/share";
import { CARD_SIZES } from "@/lib/share-item/share";
import { CARD_NAMES, SHARE_WORDS, SIZE_NAMES } from "@/lib/share-item/words";

import type { CardImage } from "./use-card-image";

/** One card in the picker: its style and its picture at the chosen size. */
export interface PickerCard {
    style: CardStyle;
    src: string;
}

const ASPECT: Record<CardSize, string> = {
    post: "aspect-[4/5]",
    square: "aspect-square",
    story: "aspect-[9/16]",
};

const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Post 4:5 · Square · Story 9:16: one switch for every card at once. */
export function SizeSwitch({
    size,
    onSize,
    block = false,
}: {
    size: CardSize;
    onSize: (size: CardSize) => void;
    block?: boolean;
}) {
    return (
        <Segmented
            label="Size"
            options={CARD_SIZES.map((s) => ({
                value: s,
                label: SIZE_NAMES[s],
            }))}
            value={size}
            onValueChange={onSize}
            block={block}
            size={block ? "md" : "sm"}
        />
    );
}

/** Arrows move and choose, as a radio group does; one tab stop. */
function useRadioKeys(
    cards: readonly PickerCard[],
    style: CardStyle,
    onStyle: (style: CardStyle) => void,
) {
    const refs = useRef(new Map<CardStyle, HTMLButtonElement>());
    const onKeyDown = (e: KeyboardEvent) => {
        const at = cards.findIndex((c) => c.style === style);
        const n = cards.length;
        const next =
            e.key === "ArrowRight" || e.key === "ArrowDown"
                ? (at + 1) % n
                : e.key === "ArrowLeft" || e.key === "ArrowUp"
                  ? (at - 1 + n) % n
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? n - 1
                      : null;
        const to = next === null ? undefined : cards[next];
        if (!to) return;
        e.preventDefault();
        onStyle(to.style);
        refs.current.get(to.style)?.focus();
    };
    const ref = (s: CardStyle) => (el: HTMLButtonElement | null) => {
        if (el) refs.current.set(s, el);
        else refs.current.delete(s);
    };
    return { onKeyDown, ref };
}

/**
 * The desk's row of ready cards (SFBDesk): click one and it shows large.
 * While the picture can't be made, the row waits greyed (SFNoImageDesk).
 */
export function CardRow({
    cards,
    style,
    onStyle,
    size,
    failed,
}: {
    cards: readonly PickerCard[];
    style: CardStyle;
    onStyle: (style: CardStyle) => void;
    size: CardSize;
    failed: boolean;
}) {
    const keys = useRadioKeys(cards, style, onStyle);
    return (
        <div
            role="radiogroup"
            aria-label={SHARE_WORDS.pick}
            onKeyDown={keys.onKeyDown}
            className="flex flex-wrap items-start gap-4"
        >
            {cards.map((c) => {
                const on = c.style === style;
                return (
                    <button
                        key={c.style}
                        ref={keys.ref(c.style)}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        tabIndex={on ? 0 : -1}
                        data-card={c.style}
                        disabled={failed}
                        onClick={() => onStyle(c.style)}
                        className={cn(
                            FOCUS,
                            "flex w-[110px] flex-col items-center gap-2 rounded-[10px] text-[13px] font-medium disabled:text-muted-foreground",
                            on && !failed && "font-semibold",
                        )}
                    >
                        <span
                            className={cn(
                                "block w-full overflow-hidden rounded-[8px] bg-muted",
                                ASPECT[size],
                                on && !failed
                                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                                    : "shadow-sm",
                            )}
                        >
                            {failed ? (
                                <span className="flex size-full items-center justify-center text-muted-foreground">
                                    <ImageIcon aria-hidden className="size-4" />
                                </span>
                            ) : (
                                // eslint-disable-next-line @next/next/no-img-element -- a PNG the API draws, not a page asset
                                <img
                                    src={c.src}
                                    alt=""
                                    className="size-full object-cover"
                                />
                            )}
                        </span>
                        {CARD_NAMES[c.style]}
                    </button>
                );
            })}
        </div>
    );
}

/** The one message where the picture was, with Try again (SFNoImage*). */
export function PictureFailed({
    onRetry,
    className,
}: {
    onRetry: () => void;
    className?: string;
}) {
    return (
        <div
            data-picture-failed=""
            className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-card/60 px-6 py-8 text-center",
                className,
            )}
        >
            <ImageIcon aria-hidden className="size-5 text-muted-foreground" />
            <p role="status" className="text-[14px] font-semibold">
                {SHARE_WORDS.noPicture}
            </p>
            <p className="max-w-[260px] text-pretty text-[13px] leading-[1.5] text-muted-foreground">
                {SHARE_WORDS.noPictureWhy}
            </p>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={onRetry}
            >
                <RotateCw aria-hidden className="size-3.5" />
                {SHARE_WORDS.tryAgain}
            </Button>
        </div>
    );
}

/** The chosen card, large, at the desk. */
export function CardPreview({
    image,
    size,
    name,
    onRetry,
}: {
    image: CardImage;
    size: CardSize;
    /** What the picture shows, for a screen reader. */
    name: string;
    onRetry: () => void;
}) {
    if (image.state === "failed") return <PictureFailed onRetry={onRetry} />;
    return (
        <div className="rounded-xl bg-muted p-3.5">
            <div
                className={cn(
                    "mx-auto w-full max-w-[250px] overflow-hidden rounded-[6px]",
                    ASPECT[size],
                )}
            >
                {image.state === "ready" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the fetched PNG, as a blob
                    <img
                        src={image.src}
                        alt={name}
                        data-preview=""
                        className="size-full object-cover"
                    />
                ) : (
                    <Skeleton className="size-full" />
                )}
            </div>
        </div>
    );
}

/**
 * The phone's big swipeable card (SFBPhone): the chosen one in the middle,
 * its neighbours peeking, dots and "Price tag · 2 of 4" under it. A swipe
 * that settles on a card chooses it; a tap on a neighbour does too.
 */
export function CardCarousel({
    cards,
    style,
    onStyle,
    size,
    image,
    name,
}: {
    cards: readonly PickerCard[];
    style: CardStyle;
    onStyle: (style: CardStyle) => void;
    size: CardSize;
    image: CardImage;
    name: string;
}) {
    const track = useRef<HTMLDivElement | null>(null);
    const keys = useRadioKeys(cards, style, onStyle);
    const at = Math.max(
        0,
        cards.findIndex((c) => c.style === style),
    );

    // The chosen card comes to the middle, from a tap, a key or a size.
    useEffect(() => {
        const el = track.current?.children[at] as HTMLElement | undefined;
        el?.scrollIntoView({
            inline: "center",
            block: "nearest",
            behavior: "smooth",
        });
    }, [at, size]);

    // `scrollend` isn't on every iPhone yet: settle 120ms after the last scroll.
    const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (settle.current) clearTimeout(settle.current);
        },
        [],
    );
    const onScroll = () => {
        if (settle.current) clearTimeout(settle.current);
        settle.current = setTimeout(settled, 120);
    };
    const settled = () => {
        const box = track.current;
        if (!box) return;
        const middle = box.scrollLeft + box.clientWidth / 2;
        let best = at;
        let gap = Infinity;
        Array.from(box.children).forEach((child, i) => {
            const c = child as HTMLElement;
            const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - middle);
            if (d < gap) {
                gap = d;
                best = i;
            }
        });
        if (cards.length > 0 && cards[best].style !== style) {
            onStyle(cards[best].style);
        }
    };

    return (
        <div className="grid gap-2">
            <div
                ref={track}
                role="radiogroup"
                aria-label={SHARE_WORDS.pick}
                onKeyDown={keys.onKeyDown}
                onScroll={onScroll}
                className="-mx-4 flex snap-x snap-mandatory items-center gap-3 overflow-x-auto px-[calc(50%-113px)] py-1 [scrollbar-width:none]"
            >
                {cards.map((c) => {
                    const on = c.style === style;
                    return (
                        <button
                            key={c.style}
                            ref={keys.ref(c.style)}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            aria-label={CARD_NAMES[c.style]}
                            tabIndex={on ? 0 : -1}
                            data-card={c.style}
                            onClick={() => onStyle(c.style)}
                            className={cn(
                                FOCUS,
                                "w-[226px] shrink-0 snap-center overflow-hidden rounded-[6px] bg-muted shadow-md transition-opacity",
                                ASPECT[size],
                                !on && "opacity-60",
                            )}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element -- a PNG the API draws */}
                            <img
                                src={
                                    on && image.state === "ready"
                                        ? image.src
                                        : c.src
                                }
                                alt={on ? name : ""}
                                className="size-full object-cover"
                            />
                        </button>
                    );
                })}
            </div>
            <p
                className="text-center text-[14px] font-semibold"
                aria-live="polite"
            >
                {CARD_NAMES[cards[at]?.style ?? "photo"]} · {at + 1} of{" "}
                {cards.length}
            </p>
            <div aria-hidden className="flex justify-center gap-1.5">
                {cards.map((c) => (
                    <span
                        key={c.style}
                        className={cn(
                            "h-1.5 rounded-full",
                            c.style === style
                                ? "w-4 bg-foreground"
                                : "w-1.5 bg-border-strong",
                        )}
                    />
                ))}
            </div>
        </div>
    );
}
