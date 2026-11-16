"use client";

import { Check } from "lucide-react";
import { useRef, useState } from "react";

import { buttonClasses } from "../../buttons/button";
import { cn } from "../../cn";
import type { SiteLook } from "../../kit/site-drawing";
import { ring } from "../../ring";
import { Section } from "../../sections/section";
import { useAutoplay } from "./autoplay";
import type { ShopSiteWords } from "./shop-site";
import { lookStyle } from "./shop-site";
import type { JourneyStage, WebsiteWords } from "./words";

/** How long each stage shows while the section plays. */
export const STAGE_MS = 2600;

const BADGE: Record<JourneyStage["tone"], string> = {
    draft: "border border-mk-on-ink-line text-mk-on-ink-muted",
    test: "border border-brand-500 text-mk-on-ink-accent",
    ok: "bg-mk-ok-tint text-mk-ok",
};

/**
 * "Nothing goes live until it's right." (board R2WebsiteOverdrive, V1
 * overdrive dark; #33): the stages on a track with a Saffron line, the
 * example site in a browser frame whose address, badge and marks follow
 * the stage, and the stage's words and buttons beside it.
 *
 * The server draws the Live stage, with every stage's words in the HTML
 * (the others `hidden`). With script and motion it starts at Draft and
 * plays a stage every `STAGE_MS` while in view; the visitor's first pick
 * or press stops that for good. Reduced motion: Live, still.
 */
export function Journey({
    words: w,
    stages,
    site,
    look,
}: {
    words: WebsiteWords["journey"];
    /** The stages drawn: with test releases, or draft then live. */
    stages: readonly JourneyStage[];
    site: ShopSiteWords;
    /** Kept for the page's call; the frame draws the released page, not the shop. */
    shop?: boolean;
    look?: SiteLook;
}) {
    const last = stages.length - 1;
    // null until it plays or the visitor moves it: Live, or Draft once it can play.
    const [moved, setAt] = useState<number | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const box = useRef<HTMLDivElement>(null);
    const { canPlay, stop } = useAutoplay(
        box,
        () => {
            setResult(null);
            setAt((a) => ((a ?? 0) + 1) % stages.length);
        },
        STAGE_MS,
    );
    const at = moved ?? (canPlay ? 0 : last);

    const pick = (i: number) => {
        stop();
        setResult(null);
        setAt(i);
    };
    const act = (r: string) => {
        stop();
        setResult(r);
        setAt(Math.min(last, at + 1));
    };

    const s = stages[at];
    const live = at === last;
    const done = result ?? stages[last - 1]?.actions?.[0]?.result;
    const n = stages.length;

    return (
        <Section
            titleId="journey-title"
            title={w.title}
            lead={w.lead}
            size="kit-h2"
            tone="ink"
            space="kit"
            className="pb-14 min-[760px]:pb-20"
        >
            <div ref={box} className="mt-10 grid gap-10 min-[760px]:mt-14">
                <ol
                    aria-label={w.track}
                    className="relative m-0 grid list-none p-0"
                    style={{
                        gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
                    }}
                >
                    <span
                        aria-hidden
                        className="absolute left-5 top-[19px] h-[3px] rounded-sm bg-mk-on-ink-line"
                        style={{ width: `${((n - 1) / n) * 100}%` }}
                    />
                    <span
                        aria-hidden
                        className="absolute left-5 top-[19px] h-[3px] rounded-sm bg-brand-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                        style={{ width: `${(at / n) * 100}%` }}
                    />
                    {stages.map((st, i) => (
                        <li key={st.title} className="relative min-w-0">
                            <button
                                type="button"
                                aria-pressed={i === at}
                                onClick={() => pick(i)}
                                className={cn(
                                    "grid min-h-11 w-full cursor-pointer justify-items-start gap-3 border-none bg-transparent p-0 pr-1 text-left text-background min-[400px]:pr-3",
                                    ring({ color: "paper", offset: 2 }),
                                )}
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        "grid size-10 place-items-center rounded-full font-mono text-[15px] font-bold transition-colors duration-300 motion-reduce:transition-none",
                                        i < at
                                            ? "bg-brand-500 text-[hsl(var(--foreground))]"
                                            : i === at
                                              ? "bg-background text-[hsl(var(--foreground))] ring-2 ring-brand-500 ring-offset-4 ring-offset-foreground"
                                              : "border border-mk-on-ink-line bg-foreground text-mk-on-ink-muted",
                                    )}
                                >
                                    {i < at ? (
                                        <Check className="size-4" />
                                    ) : (
                                        i + 1
                                    )}
                                </span>
                                <b
                                    className={cn(
                                        "font-display text-[13px] font-bold leading-tight tracking-[-0.02em] min-[400px]:text-[16px] min-[760px]:text-[22px]",
                                        i > at && "text-mk-on-ink-muted",
                                    )}
                                >
                                    {st.title}
                                </b>
                                <span
                                    className={cn(
                                        "hidden text-[14px] min-[760px]:block",
                                        i === at
                                            ? "text-mk-on-ink-accent"
                                            : "text-mk-on-ink-muted",
                                    )}
                                >
                                    {st.sub}
                                </span>
                            </button>
                        </li>
                    ))}
                </ol>

                <div className="grid items-center gap-8 min-[1080px]:grid-cols-[minmax(0,1fr)_360px] min-[1080px]:gap-14">
                    <figure
                        aria-label={w.label}
                        data-stage={s.title}
                        className={cn(
                            "m-0 min-w-0 overflow-hidden rounded-2xl border shadow-mk-zoom transition-colors duration-500 motion-reduce:transition-none",
                            live ? "border-mk-ok" : "border-mk-on-ink-line",
                        )}
                    >
                        <div className="flex items-center gap-3 border-b border-mk-on-ink-line bg-foreground px-3 py-2.5 min-[760px]:px-4 min-[760px]:py-3">
                            <span
                                aria-hidden
                                className="hidden gap-1.5 min-[760px]:flex"
                            >
                                <i className="block size-2.5 rounded-full bg-mk-on-ink-line" />
                                <i className="block size-2.5 rounded-full bg-mk-on-ink-line" />
                                <i className="block size-2.5 rounded-full bg-mk-on-ink-line" />
                            </span>
                            <span className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-mk-on-ink-line bg-transparent px-3 py-2 font-mono text-[13px] text-mk-on-ink min-[760px]:text-[15px]">
                                <span
                                    aria-hidden
                                    className={cn(
                                        "relative block size-[9px] shrink-0 rounded-full",
                                        live
                                            ? "bg-mk-ok"
                                            : at === 0
                                              ? "bg-mk-on-ink-line"
                                              : "bg-brand-500",
                                    )}
                                >
                                    {live ? (
                                        <i className="absolute inset-0 rounded-full bg-mk-ok motion-safe:animate-ping" />
                                    ) : null}
                                </span>
                                <span className="truncate">{s.host}</span>
                            </span>
                            <span
                                className={cn(
                                    "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold",
                                    BADGE[s.tone],
                                )}
                            >
                                {s.badge}
                            </span>
                        </div>
                        <div
                            className="relative"
                            style={look ? lookStyle(look) : undefined}
                        >
                            <div className="flex min-h-[300px] flex-col gap-5 bg-[hsl(var(--site-bg))] px-6 pb-8 pt-6 font-[family-name:var(--site-font-body)] text-[hsl(var(--site-fg))] min-[760px]:px-10 min-[760px]:pt-8">
                                <div className="flex items-center justify-between">
                                    <span className="font-[family-name:var(--site-font-heading)] text-[18px] font-semibold min-[760px]:text-[22px]">
                                        {site.name}
                                    </span>
                                    <span className="rounded-[var(--site-radius)] bg-[hsl(var(--site-accent))] px-3 py-1.5 text-[13px] font-semibold text-[hsl(var(--site-accent-fg))]">
                                        {site.order}
                                    </span>
                                </div>
                                <p className="m-0 font-[family-name:var(--site-font-heading)] text-[30px] font-bold leading-[1.05] tracking-[-0.02em] min-[760px]:text-[44px]">
                                    {w.page.heading}
                                </p>
                                <ul className="m-0 grid list-none gap-3 p-0 min-[560px]:grid-cols-2">
                                    {w.page.items.map((x) => (
                                        <li
                                            key={x.name}
                                            className="flex items-center justify-between gap-3 rounded-[var(--site-radius)] bg-[hsl(var(--site-surface))] px-4 py-3 text-[15px]"
                                        >
                                            <span>{x.name}</span>
                                            <b>{x.price}</b>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            {s.stamp ? (
                                <span className="absolute bottom-6 right-6 rotate-[4deg] rounded-lg border-2 border-dashed border-brand-700 bg-mk-tint/90 px-3 py-1.5 font-mono text-[13px] font-bold text-brand-700">
                                    {s.stamp}
                                </span>
                            ) : null}
                            {s.chip ? (
                                <span className="absolute bottom-4 right-4 flex items-center gap-2.5 rounded-full bg-card py-2 pl-2 pr-3.5 text-[14px] text-[hsl(var(--foreground))] shadow-mk-menu">
                                    <span
                                        aria-hidden
                                        className="grid size-7 place-items-center rounded-full bg-mk-ok-tint text-mk-ok"
                                    >
                                        <Check className="size-4" />
                                    </span>
                                    {s.chip}
                                </span>
                            ) : null}
                        </div>
                    </figure>

                    <div className="grid content-start gap-4">
                        {stages.map((st, i) => (
                            <div
                                key={st.title}
                                hidden={i !== at}
                                data-stage-words={st.title}
                                className={cn(
                                    "gap-4",
                                    i === at ? "grid" : "hidden",
                                )}
                            >
                                <h3 className="m-0 font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-background min-[760px]:text-[26px]">
                                    {st.heading}
                                </h3>
                                <p className="m-0 text-[16px] leading-normal text-mk-on-ink min-[760px]:text-[17px]">
                                    {st.body}
                                </p>
                                {st.actions?.length ? (
                                    <div className="mt-1.5 flex flex-wrap gap-2.5">
                                        {st.actions.map((a, k) => (
                                            <button
                                                key={a.label}
                                                type="button"
                                                onClick={() => act(a.result)}
                                                className={buttonClasses({
                                                    variant:
                                                        k === 0
                                                            ? "saffron"
                                                            : "secondary-on-ink",
                                                    size: "kit",
                                                })}
                                            >
                                                {a.label}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                                {i === last && done ? (
                                    <p className="m-0 flex items-center gap-2 text-[15px] font-bold text-mk-ok-tint">
                                        <Check
                                            aria-hidden
                                            className="size-4 text-mk-ok"
                                        />
                                        {done}
                                    </p>
                                ) : null}
                                {st.plan ? (
                                    <p className="m-0 text-[14px] text-mk-on-ink-muted">
                                        {st.plan}
                                    </p>
                                ) : null}
                            </div>
                        ))}
                        {at > 0 && (canPlay || moved !== null) ? (
                            <button
                                type="button"
                                onClick={() => pick(0)}
                                className={cn(
                                    "min-h-11 cursor-pointer justify-self-start border-none bg-transparent px-0 text-[14px] font-semibold text-background underline underline-offset-4",
                                    ring({ color: "paper", offset: 2 }),
                                )}
                            >
                                {w.startOver}
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        </Section>
    );
}
