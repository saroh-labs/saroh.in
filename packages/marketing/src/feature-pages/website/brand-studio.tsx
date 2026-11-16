"use client";

import { useRef, useState } from "react";

import { cn } from "../../cn";
import { ring } from "../../ring";
import { Section } from "../../sections/section";
import { useAutoplay } from "./autoplay";
import type { LookOption } from "./looks";
import type { ShopSiteWords } from "./shop-site";
import { lookStyle, MiniSite } from "./shop-site";
import type { WebsiteWords } from "./words";

/** How long each colour set shows while the section plays. */
export const LOOK_MS = 2600;

/** Desktop, Tablet, Phone: the frame's width and corners. */
const SCREEN = [
    "max-w-[740px] rounded-[14px]",
    "max-w-[480px] rounded-[24px]",
    "max-w-[290px] rounded-[36px]",
] as const;

const LABEL =
    "text-[13px] font-semibold uppercase tracking-[0.06em] text-mk-on-ink-muted";

/**
 * "Your brand, every screen." (board R2WebsiteOverdrive, V1 overdrive
 * dark; #35, #36): the colour sets (each with its typefaces) and the
 * editor's Desktop, Tablet and Phone, over the example site in a device
 * frame. While in view it plays every colour set, then the next screen;
 * the visitor's first pick stops that for good. Reduced motion, and the
 * server: the first set on Desktop, still.
 */
export function BrandStudio({
    words: w,
    options,
    site,
    shop,
}: {
    words: WebsiteWords["studio"];
    options: readonly LookOption[];
    site: ShopSiteWords;
    shop: boolean;
}) {
    const [{ pal, dev }, setOn] = useState({ pal: 0, dev: 0 });
    const box = useRef<HTMLDivElement>(null);
    const { stop } = useAutoplay(
        box,
        // Every colour set, then the next screen.
        () =>
            setOn((v) => {
                const next = (v.pal + 1) % options.length;
                return {
                    pal: next,
                    dev: next ? v.dev : (v.dev + 1) % w.devices.length,
                };
            }),
        LOOK_MS,
    );
    const o = options[pal] ?? options[0];
    const device = w.devices[dev];

    return (
        <Section
            titleId="studio-title"
            title={w.title}
            lead={w.lead}
            size="kit-h2"
            tone="ink"
            space="kit"
            className="border-t border-mk-on-ink-line pt-14 min-[760px]:pt-20"
        >
            <div
                ref={box}
                className="mt-10 grid items-start gap-10 min-[760px]:mt-14 min-[1080px]:grid-cols-[400px_minmax(0,1fr)] min-[1080px]:gap-14"
            >
                <div className="grid gap-7">
                    <div className="grid gap-3">
                        <span id="studio-colours" className={LABEL}>
                            {w.colours}
                        </span>
                        <div
                            role="group"
                            aria-labelledby="studio-colours"
                            className="grid grid-cols-2 gap-2.5"
                        >
                            {options.map((x, i) => (
                                <button
                                    key={x.label}
                                    type="button"
                                    aria-pressed={i === pal}
                                    onClick={() => {
                                        stop();
                                        setOn((v) => ({ ...v, pal: i }));
                                    }}
                                    className={cn(
                                        "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3 text-left text-[14px] font-semibold text-background",
                                        i === pal
                                            ? "border-2 border-brand-500 bg-transparent"
                                            : "m-px border border-mk-on-ink-line bg-transparent",
                                        ring({ color: "paper", offset: 2 }),
                                    )}
                                >
                                    <span
                                        aria-hidden
                                        className="size-[34px] shrink-0 rounded-lg"
                                        style={{
                                            background: `linear-gradient(135deg, hsl(${x.look.bg}) 55%, hsl(${x.look.accent}) 55%)`,
                                        }}
                                    />
                                    {x.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid gap-3">
                        <span id="studio-screen" className={LABEL}>
                            {w.screen}
                        </span>
                        <div
                            role="group"
                            aria-labelledby="studio-screen"
                            className="flex gap-1 rounded-xl border border-mk-on-ink-line p-1"
                        >
                            {w.devices.map((d, i) => (
                                <button
                                    key={d}
                                    type="button"
                                    aria-pressed={i === dev}
                                    onClick={() => {
                                        stop();
                                        setOn((v) => ({ ...v, dev: i }));
                                    }}
                                    className={cn(
                                        "min-h-11 flex-1 cursor-pointer rounded-[9px] border-none text-[15px] font-semibold",
                                        i === dev
                                            ? "bg-background text-[hsl(var(--foreground))]"
                                            : "bg-transparent text-mk-on-ink-muted",
                                        ring({ color: "paper", offset: 2 }),
                                    )}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                    <p className="m-0 text-[14px] leading-normal text-mk-on-ink-muted">
                        {w.note}
                    </p>
                </div>
                <div className="flex justify-center rounded-[20px] px-3 min-[760px]:px-8">
                    <figure
                        aria-label={`${w.label}, in ${o.label.toLowerCase()}, on ${device.toLowerCase()}`}
                        data-look={o.label}
                        data-screen={device}
                        className={cn(
                            "m-0 w-full overflow-hidden border border-mk-on-ink-line shadow-mk-zoom transition-[max-width,border-radius] duration-500 ease-out motion-reduce:transition-none",
                            SCREEN[dev],
                        )}
                        style={lookStyle(o.look, o.band)}
                    >
                        <MiniSite words={site} shop={shop} caps={o.caps} fit />
                    </figure>
                </div>
            </div>
        </Section>
    );
}
