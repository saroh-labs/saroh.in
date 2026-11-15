"use client";

import { cn } from "@saroh/marketing/cn";
import type { SiteLook } from "@saroh/marketing/kit/site-drawing";
import { ring } from "@saroh/marketing/ring";
import { useState } from "react";

import type { ShopSiteWords } from "./shop-site";
import { lookStyle, MiniSite, ShopSite } from "./shop-site";

export interface LookOption {
    label: string;
    line: string;
    look: SiteLook;
    band?: { bg: string; fg: string };
    caps?: boolean;
}

/** An address bar over a site drawing (FW's `.addr`). */
function Address({
    address,
    example,
    small = false,
}: {
    address: string;
    example?: string;
    small?: boolean;
}) {
    return (
        <div
            className={cn(
                "flex items-center gap-2.5 border-b border-mk-line-row bg-card px-3.5 text-[13px] text-mk-copy",
                small ? "h-[34px]" : "h-11",
            )}
        >
            {small ? null : (
                <span aria-hidden className="flex gap-1.5">
                    <i className="block size-2.5 rounded-full bg-mk-hover" />
                    <i className="block size-2.5 rounded-full bg-mk-hover" />
                    <i className="block size-2.5 rounded-full bg-mk-hover" />
                </span>
            )}
            <span
                className={cn(
                    "flex min-w-0 flex-1 items-center truncate rounded-lg bg-mk-noon px-2.5 font-mono text-[12.5px]",
                    small ? "h-[22px] text-[12px]" : "h-7",
                )}
            >
                {address}
            </span>
            {example ? (
                <span className="rounded-md bg-mk-hover px-2 py-[3px] text-[12px] font-semibold">
                    {example}
                </span>
            ) : null}
        </div>
    );
}

/**
 * "Then pick its look" (FW's stage): the trade looks as a segmented switch
 * over Rye & Co.'s site, the words and prices staying put while the look
 * changes. On desk the other three looks sit beside it, small; a press on
 * one picks it. On a phone the switch alone changes the one site.
 */
export function Looks({
    id,
    label,
    group,
    note,
    frameLabel,
    example,
    options,
    words,
    shop,
}: {
    id: string;
    label: string;
    group: string;
    note: string;
    frameLabel: string;
    example: string;
    options: readonly LookOption[];
    words: ShopSiteWords;
    shop: boolean;
}) {
    const [on, setOn] = useState(0);
    const current = options[on];
    return (
        <div id={id} className="scroll-mt-24">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <span className="hidden text-[15px] font-semibold min-[760px]:inline">
                    {label}
                </span>
                <div
                    role="group"
                    aria-label={group}
                    className="-mx-mk-gutter flex max-w-[100vw] gap-1 overflow-x-auto rounded-xl bg-mk-hover p-1 px-mk-gutter [scrollbar-width:none] min-[760px]:mx-0 min-[760px]:px-1"
                >
                    {options.map((o, i) => (
                        <button
                            key={o.label}
                            type="button"
                            aria-pressed={i === on}
                            onClick={() => setOn(i)}
                            className={cn(
                                "h-10 shrink-0 whitespace-nowrap rounded-[9px] px-4 text-[15px] font-medium text-mk-copy transition-colors hover:text-foreground motion-reduce:transition-none",
                                i === on &&
                                    "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(28,28,26,0.14)]",
                                ring(),
                            )}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
                <span className="text-[14.5px] text-muted-foreground min-[1080px]:ml-auto">
                    {note}
                </span>
            </div>
            <div className="mt-4 grid items-start gap-7 min-[1080px]:grid-cols-[1fr_290px]">
                <figure
                    aria-label={`${frameLabel}, in the ${current.label.toLowerCase()}`}
                    className="relative m-0 min-w-0 overflow-hidden rounded-mk-card bg-card shadow-[0_1px_2px_rgba(40,30,15,0.06),0_28px_60px_-24px_rgba(40,30,15,0.32)] max-[759px]:max-h-[620px]"
                >
                    <Address address={words.address} example={example} />
                    <div
                        style={lookStyle(current.look, current.band)}
                        className="transition-[filter] duration-base"
                    >
                        <ShopSite words={words} shop={shop} />
                    </div>
                    {/* A phone crops the site, never shrinks it (PHONE.md). */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-[hsl(var(--site-bg))] min-[760px]:hidden"
                        style={lookStyle(current.look, current.band)}
                    />
                </figure>
                <ul className="m-0 hidden list-none gap-[22px] p-0 min-[1080px]:grid">
                    {options.map((o, i) =>
                        i === on ? null : (
                            <li key={o.label}>
                                <button
                                    type="button"
                                    onClick={() => setOn(i)}
                                    className={cn(
                                        "block w-full overflow-hidden rounded-xl bg-card text-left shadow-[0_1px_2px_rgba(40,30,15,0.06),0_18px_40px_-24px_rgba(40,30,15,0.32)] transition-transform hover:-translate-y-0.5 motion-reduce:transition-none",
                                        ring(),
                                    )}
                                >
                                    <Address address={words.address} small />
                                    <div style={lookStyle(o.look, o.band)}>
                                        <MiniSite
                                            words={words}
                                            shop={shop}
                                            caps={o.caps}
                                        />
                                    </div>
                                </button>
                                <p className="m-0 mt-2.5 text-[14px] leading-snug text-mk-copy">
                                    <b className="block font-semibold text-foreground">
                                        {o.label}
                                    </b>
                                    {o.line}
                                </p>
                            </li>
                        ),
                    )}
                </ul>
            </div>
        </div>
    );
}
