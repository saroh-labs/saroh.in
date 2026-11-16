"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Segmented } from "@saroh/ui/segmented";
import { ImageIcon, RotateCw } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useRef } from "react";

import type { CardSize, CardStyle } from "@/lib/share-item/share";
import { CARD_SIZES } from "@/lib/share-item/share";
import { CARD_NAMES, SHARE_WORDS, SIZE_NAMES } from "@/lib/share-item/words";

import { ASPECT } from "./insta-frame";
import type { CardImage } from "./use-card-image";

/** One card in the picker: its style and its picture at the chosen size. */
export interface PickerCard {
    style: CardStyle;
    src: string;
}

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
                // "Post", the ratio left to the picture (boards BPost*).
                label: SIZE_NAMES[s].replace(/ \d+:\d+$/, ""),
                name: SIZE_NAMES[s],
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
            className="flex flex-wrap items-start gap-2.5"
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
                            "flex w-[72px] flex-col items-center gap-1.5 rounded-[10px] p-1 text-[12.5px] font-medium text-muted-foreground disabled:text-muted-foreground",
                            on &&
                                !failed &&
                                "font-semibold text-foreground ring-2 ring-foreground",
                        )}
                    >
                        <span
                            className={cn(
                                "block w-16 overflow-hidden rounded-[4px] bg-muted shadow-sm",
                                ASPECT[size],
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

/**
 * The phone's swipe through the looks (BPostPhone, SBSharePhone), drawn
 * where the post's picture is: one card at a time, full width. A swipe
 * that settles on a card chooses it. Under the post, `LookDots` names it.
 */
export function SwipeTrack({
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

    // The chosen card comes into view, from a key or a size.
    useEffect(() => {
        const box = track.current;
        const el = box?.children[at] as HTMLElement | undefined;
        if (box && el && Math.abs(box.scrollLeft - el.offsetLeft) > 2) {
            box.scrollTo({ left: el.offsetLeft, behavior: "smooth" });
        }
    }, [at, size]);

    // `scrollend` isn't on every iPhone yet: settle 120ms after the last scroll.
    const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (settle.current) clearTimeout(settle.current);
        },
        [],
    );
    const settled = () => {
        const box = track.current;
        if (!box || box.clientWidth === 0) return;
        const best = Math.round(box.scrollLeft / box.clientWidth);
        const to = cards.at(Math.min(cards.length - 1, Math.max(0, best)));
        if (to && to.style !== style) onStyle(to.style);
    };
    const onScroll = () => {
        if (settle.current) clearTimeout(settle.current);
        settle.current = setTimeout(settled, 120);
    };

    return (
        <div
            ref={track}
            role="radiogroup"
            aria-label={SHARE_WORDS.pick}
            onKeyDown={keys.onKeyDown}
            onScroll={onScroll}
            data-swipe-track=""
            className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
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
                            "w-full shrink-0 snap-center bg-muted",
                            ASPECT[size],
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
    );
}

/** "Price tag · swipe for another look", and a dot per look. */
export function LookDots({
    cards,
    style,
}: {
    cards: readonly PickerCard[];
    style: CardStyle;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <p className="text-[13.5px]" aria-live="polite">
                <b className="font-semibold">{CARD_NAMES[style]}</b>
                <span className="text-muted-foreground">
                    {" "}
                    · {SHARE_WORDS.swipe}
                </span>
            </p>
            <div aria-hidden className="flex gap-[5px]">
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
