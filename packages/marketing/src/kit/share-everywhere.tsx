"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { useAutoplay } from "./autoplay";
import { Chip } from "./chip";
import type { DrawnPhotoKind } from "./drawn-photo";
import { DrawnPhoto } from "./drawn-photo";
import type { SiteLook } from "./site-drawing";
import { siteVars } from "./site-drawing";
import { SwipeRow } from "./swipe-row";

/** One thing the business shares: a chip, and the post each app shows. */
export interface SharePost {
    /** The chip: "A product". */
    label: string;
    /** The square's tag: "New", "Class", "Offer", "Journal". */
    kind: string;
    title: string;
    /** Under the title in the chat's link preview: "₹360 · box of 6". */
    sub: string;
    /** The square's line: a price, places left, "20% off". */
    line: string;
    caption: string;
    /** A customer's answer in the chat. */
    reply: string;
    /** Its page on the site: "/shop/cardamom-bun-box". */
    path: string;
    photo: DrawnPhotoKind;
}

/** Share's closing words (#46, board "U · one post, everywhere"). */
export interface ShareEverywhereWords {
    lede: string;
    /** Names the chips for a screen reader: "What to share". */
    pick: string;
    /** Names the row of posts: "The same post in each app". */
    row: string;
    /** The column labels, app names as words: "WhatsApp · a chat". */
    apps: { whatsapp: string; instagram: string; facebook: string };
    /** The Instagram account the square is posted from: "ryeandco". */
    handle: string;
    /** The word in "1 of 3" on a phone. */
    of: string;
    posts: readonly SharePost[];
}

/** 3.2s an item (board U). */
const EVERY = 3200;
// Dark text named by its value: an Ink section rewrites `text-foreground`.
/** An app's post under its name. */
const column = (label: string, post: ReactNode) => (
    <div className="grid gap-2.5">
        <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-mk-on-ink-muted">
            {label}
        </span>
        {post}
    </div>
);
const APP =
    "h-[300px] rounded-[18px] border border-border p-3 text-[14px] text-[hsl(var(--foreground))]";
const HEADING =
    "font-[family-name:var(--site-font-heading)] [font-weight:var(--site-heading-weight)] text-[hsl(var(--site-fg))]";

/**
 * Share's closing picture (owner, 16 Nov 2026, #46 "U"): chips for the kinds
 * of thing Share shares, and the same post as each app shows it: a WhatsApp
 * chat with the link's preview, an Instagram square, a Facebook link post,
 * each in the business's own look. It moves to the next item every 3.2s
 * while the band is in view and the tab is showing; a picked chip stops it
 * for good, and reduced motion never starts it. The server's HTML is the
 * first item. The apps are drawn in Saroh's own colours (Paper, card,
 * the ok tint), named in words, with no marks; only the post is the
 * business's. Text on the business's colours is only its ink, its muted ink, or
 * its accent on its surface (each 4.5:1 for the bakery look).
 */
export function ShareEverywhere({
    words,
    business,
}: {
    words: ShareEverywhereWords;
    business: { name: string; site: string; look: SiteLook };
}) {
    const root = useRef<HTMLDivElement>(null);
    const [at, setAt] = useState(0);
    const [picked, setPicked] = useState(false);
    const n = words.posts.length;
    useAutoplay(() => setAt((a) => (a + 1) % n), EVERY, {
        stopped: picked || n < 2,
        watch: root,
    });
    if (n === 0) return null;
    const p = words.posts[at];
    const host = `${business.site}${p.path}`;

    return (
        <div
            ref={root}
            data-share-everywhere=""
            className="grid w-full gap-6 justify-self-stretch min-[760px]:gap-8"
        >
            <div className="grid gap-4">
                <p className="m-0 max-w-[60ch] text-[17px] leading-normal text-mk-on-ink">
                    {words.lede}
                </p>
                <div
                    role="group"
                    aria-label={words.pick}
                    className="flex flex-wrap gap-2"
                >
                    {words.posts.map((x, i) => (
                        <Chip
                            key={x.label}
                            variant="ink"
                            on={i === at}
                            onClick={() => {
                                setAt(i);
                                setPicked(true);
                            }}
                        >
                            {x.label}
                        </Chip>
                    ))}
                </div>
            </div>
            <SwipeRow
                label={words.row}
                of={words.of}
                className="min-w-0 [&>p]:text-mk-on-ink-muted"
            >
                {column(
                    words.apps.whatsapp,
                    <div
                        className={`${APP} flex flex-col justify-end gap-2 bg-background p-4`}
                    >
                        <div className="flex max-w-[92%] flex-col self-end rounded-[14px_14px_4px_14px] bg-mk-ok-tint p-1.5">
                            <div
                                style={siteVars(business.look)}
                                className="flex overflow-hidden rounded-[10px] bg-[hsl(var(--site-surface))]"
                            >
                                <DrawnPhoto
                                    kind={p.photo}
                                    className="w-[72px] shrink-0"
                                />
                                <div className="grid min-w-0 gap-0.5 px-2.5 py-2">
                                    <b
                                        className={`${HEADING} text-[15px] leading-tight`}
                                    >
                                        {p.title}
                                    </b>
                                    <span className="text-[12.5px] text-[hsl(var(--site-muted))]">
                                        {p.sub}
                                    </span>
                                    <span className="truncate font-mono text-[11px] text-[hsl(var(--site-accent))]">
                                        {host}
                                    </span>
                                </div>
                            </div>
                            <span className="px-1.5 pb-0.5 pt-2">
                                {p.caption}
                            </span>
                        </div>
                        <span className="self-start rounded-[14px_14px_14px_4px] border border-border bg-card px-3 py-2">
                            {p.reply}
                        </span>
                    </div>,
                )}
                {column(
                    words.apps.instagram,
                    <div
                        style={siteVars(business.look)}
                        className={`${APP} flex flex-col gap-2.5 bg-card`}
                    >
                        <span className="flex items-center gap-2 text-[13px] font-semibold">
                            <span
                                aria-hidden
                                className={`${HEADING} grid size-6 place-items-center rounded-full bg-[hsl(var(--site-surface))] text-[10px]`}
                            >
                                {business.name.charAt(0)}
                            </span>
                            {words.handle}
                        </span>
                        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
                            <DrawnPhoto kind={p.photo} className="flex-1" />
                            <span className="absolute left-3 top-3 rounded-full bg-[hsl(var(--site-accent))] px-2.5 py-1 text-[12px] font-bold text-[hsl(var(--site-accent-fg))]">
                                {p.kind}
                            </span>
                            <div className="grid gap-1 bg-[hsl(var(--site-surface))] px-3.5 py-3">
                                <b
                                    className={`${HEADING} text-[20px] leading-tight`}
                                >
                                    {p.title}
                                </b>
                                <span className="text-[15px] font-bold text-[hsl(var(--site-accent))]">
                                    {p.line}
                                </span>
                            </div>
                        </div>
                    </div>,
                )}
                {column(
                    words.apps.facebook,
                    <div className={`${APP} flex flex-col gap-2.5 bg-card`}>
                        <span className="line-clamp-3 px-0.5">{p.caption}</span>
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border">
                            <DrawnPhoto kind={p.photo} className="flex-1" />
                            <div className="grid gap-0.5 bg-background px-3 py-2.5">
                                <span className="truncate font-mono text-[11px] uppercase text-[hsl(var(--muted-foreground))]">
                                    {business.site}
                                </span>
                                <b className="text-[15px]">
                                    {p.title} · {business.name}
                                </b>
                            </div>
                        </div>
                    </div>,
                )}
            </SwipeRow>
        </div>
    );
}
