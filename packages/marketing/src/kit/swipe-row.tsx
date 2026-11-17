"use client";

import type { ReactNode } from "react";
import { Children, useEffect, useRef, useState } from "react";

import { cn } from "../cn";
import { ring } from "../ring";

/**
 * Three or more of a kind on a phone (PHONE.md): one card in full, the next
 * peeking 24px from the right edge, and under them "1 of N" in 12px meta.
 * Every card is in the HTML; the row only scrolls. From 760px wide the
 * cards sit in `columns` columns and the count goes.
 *
 * The count follows the card in view; its words are the page's (`of`).
 */
export function SwipeRow({
    children,
    label,
    columns = 3,
    of = "of",
    bleed = true,
    className,
}: {
    children: ReactNode;
    /** Names the row for a screen reader ("Trades", "Moments"). */
    label: string;
    /** Columns from 760px wide. */
    columns?: 1 | 2 | 3 | 4;
    /** The word in "1 of 4". */
    of?: string;
    /** Runs to the window's edge on a phone; false inside a padded card, whose edge would clip it. */
    bleed?: boolean;
    className?: string;
}) {
    const items = Children.toArray(children);
    const row = useRef<HTMLUListElement>(null);
    const [shown, setShown] = useState(1);

    useEffect(() => {
        const list = row.current;
        // No observer (an old browser, a test's DOM): the count stays "1 of N".
        if (!list || typeof IntersectionObserver === "undefined") return;
        const cards = [...list.children];
        const watch = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    // The first report covers every card, the peeking one too: count only a card mostly in view.
                    if (e.intersectionRatio >= 0.6)
                        setShown(cards.indexOf(e.target) + 1);
                }
            },
            { root: list, threshold: 0.6 },
        );
        for (const card of cards) watch.observe(card);
        return () => watch.disconnect();
    }, [items.length]);

    return (
        <div className={className}>
            {/* Scrolls sideways on purpose: the e2e hidden-sideways check allows
                it, and a keyboard reaches it to scroll (a card may hold no link). */}
            <ul
                data-scroll-x=""
                tabIndex={0}
                ref={row}
                aria-label={label}
                className={cn(
                    // The row runs to the window's edge on a phone, so the
                    // next card peeks 24px past the gutter.
                    "m-0 flex snap-x snap-mandatory list-none gap-3 overflow-x-auto p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                    bleed && "-mr-mk-gutter pr-mk-gutter",
                    ring(),
                    "min-[760px]:mr-0 min-[760px]:grid min-[760px]:gap-6 min-[760px]:overflow-visible min-[760px]:pr-0",
                    columns === 1 && "min-[760px]:grid-cols-1",
                    columns === 2 && "min-[760px]:grid-cols-2",
                    columns === 3 && "min-[760px]:grid-cols-3",
                    columns === 4 && "min-[760px]:grid-cols-4",
                )}
            >
                {items.map((item, i) => (
                    <li
                        key={i}
                        className="w-[calc(100%-24px)] shrink-0 snap-start min-[760px]:w-auto"
                    >
                        {item}
                    </li>
                ))}
            </ul>
            {items.length > 1 ? (
                <p className="m-0 mt-3 text-[12px] text-muted-foreground min-[760px]:hidden">
                    {shown} {of} {items.length}
                </p>
            ) : null}
        </div>
    );
}
