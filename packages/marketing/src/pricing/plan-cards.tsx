import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import type { ButtonSize, ButtonVariant } from "../buttons/button";
import { cn } from "../cn";
import { Pill } from "../links/pill";
import { ring } from "../ring";
import type { PlanCardView } from "./pricing-model";

/** How a card's button looks; the button itself, its label and address are the site's. */
export interface PlanCtaLook {
    size: ButtonSize;
    variant: ButtonVariant;
    className: string;
}

export type PlanCta = (plan: PlanCardView, look: PlanCtaLook) => ReactNode;

/**
 * The Pricing design's plan cards: name and tagline, the price with its
 * "a month" and the line under it, the start button, then what the plan
 * includes. The catalogue's highlighted plan is Ink with the Saffron button;
 * the rest are white with an outlined one. Every word comes ready-made from
 * `pricing-view.ts`; the button comes from the site (`cta`).
 */
export function PlanCards({
    plans,
    cta,
    ownHeight,
}: {
    plans: PlanCardView[];
    cta: PlanCta;
    /** Each card as tall as its own words, not the row's tallest. */
    ownHeight?: boolean;
}) {
    return (
        <div
            className={cn(
                "grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-4",
                ownHeight ? "items-start" : "items-stretch",
            )}
        >
            {plans.map((p) => (
                <PlanCard key={p.id} plan={p} cta={cta} />
            ))}
        </div>
    );
}

/** A part the draft changed, on the staff preview with "Show what changed". */
const MARK = "rounded-[6px] bg-mk-soon px-1 text-foreground";

function Changed() {
    return <span className="sr-only"> (changed)</span>;
}

/** Lines a phone shows before "All N in ‹plan›" (PHONE.md: fold in the DOM). */
const PHONE_LINES = 4;

function PlanCard({ plan: p, cta }: { plan: PlanCardView; cta: PlanCta }) {
    const f = p.featured;
    const muted = f ? "text-mk-on-ink-muted" : "text-muted-foreground";
    const ch = p.changed;
    const tick = (l: { t: string }) => (
        <li
            key={l.t}
            className={cn("flex gap-2.5", ch?.lines.includes(l.t) && MARK)}
        >
            <Check
                aria-hidden
                strokeWidth={2.4}
                className={cn(
                    "mt-[3px] size-4 shrink-0",
                    f ? "text-mk-saffron" : "text-brand-500",
                )}
            />
            {l.t}
            {ch?.lines.includes(l.t) ? <Changed /> : null}
        </li>
    );
    const shown = p.lines.slice(0, PHONE_LINES);
    const folded = p.lines.slice(PHONE_LINES);
    const listClass = cn(
        "m-0 grid list-none gap-2.5 p-0 text-[15px] leading-[1.45]",
        f ? "text-mk-on-ink" : "text-mk-copy",
    );
    const head = cn("font-semibold", f ? "text-background" : "text-foreground");
    return (
        <div
            data-plan={p.id}
            className={cn(
                "flex flex-col gap-3.5 rounded-[18px] border px-5 py-[22px] min-[760px]:px-6 min-[760px]:py-[26px]",
                f
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground",
            )}
        >
            <div>
                <h3 className="m-0 flex flex-wrap items-center gap-2 text-[17px] font-semibold leading-normal">
                    <span className={cn(ch?.name && MARK)}>{p.name}</span>
                    {ch?.name ? <Changed /> : null}
                    {p.tag ? (
                        <Pill
                            tone="soon"
                            className={cn(
                                "px-[9px] py-[3px] text-[12px]",
                                f && "bg-mk-ink-hover text-mk-on-ink-accent",
                            )}
                        >
                            {p.tag}
                        </Pill>
                    ) : null}
                </h3>
                {p.tagline ? (
                    <p
                        className={cn(
                            "m-0 mt-1 text-[14.5px] min-[760px]:min-h-[46px]",
                            muted,
                        )}
                    >
                        {p.tagline}
                    </p>
                ) : null}
            </div>
            <div>
                <p
                    className={cn(
                        "m-0 flex flex-wrap items-baseline gap-x-1.5 font-display text-mk-price-lg font-bold leading-none",
                        ch?.price && MARK,
                    )}
                >
                    {p.was ? (
                        <span className="sr-only">Offer price </span>
                    ) : null}
                    {p.price}
                    {p.was ? (
                        <>
                            {/* The struck price starts the next line (the board's break). */}
                            <span aria-hidden className="h-0 basis-full" />
                            <s
                                className={cn(
                                    "mt-1 text-[17px] font-medium tracking-[-0.01em] decoration-[1.5px]",
                                    muted,
                                )}
                            >
                                <span className="sr-only">regular price </span>
                                {p.was}
                            </s>
                        </>
                    ) : null}
                    {p.per ? (
                        <span
                            className={cn(
                                "font-sans text-[15px] font-medium tracking-normal",
                                ch?.price ? "text-muted-foreground" : muted,
                            )}
                        >
                            {p.per}
                        </span>
                    ) : null}
                    {ch?.price ? <Changed /> : null}
                </p>
                {p.sub ? (
                    <p className={cn("m-0 mt-1.5 text-mk-note", muted)}>
                        {p.sub}
                    </p>
                ) : null}
                {p.then ? (
                    <p
                        className={cn(
                            "m-0 mt-2 text-[14px] leading-[1.45]",
                            f ? "text-mk-on-ink" : "text-mk-copy",
                        )}
                    >
                        {p.trial ? (
                            <>
                                <b
                                    className={cn(
                                        "font-semibold",
                                        f
                                            ? "text-mk-on-ink-accent"
                                            : "text-brand-700",
                                    )}
                                >
                                    {p.trial}
                                </b>
                                {" · "}
                            </>
                        ) : null}
                        {p.then}
                    </p>
                ) : null}
            </div>
            {cta(p, {
                size: "md",
                variant: f ? "saffron" : "secondary",
                className: cn(
                    "w-full focus-visible:outline-brand-500 active:scale-[0.98]",
                    f && "h-12",
                    !f && "hover:bg-background",
                ),
            })}
            {p.note ? (
                <p
                    className={cn(
                        "m-0 flex gap-1.5 text-[13px] leading-[1.45]",
                        muted,
                    )}
                >
                    <ShieldCheck
                        aria-hidden
                        strokeWidth={2}
                        className="mt-0.5 size-3.5 shrink-0"
                    />
                    {p.note}
                </p>
            ) : null}
            <div
                className={cn(
                    "mt-0.5 grid gap-2.5 border-t pt-4",
                    f ? "border-mk-ink-hover" : "border-mk-line-soft",
                )}
            >
                <ul className={listClass}>
                    {p.lead ? <li className={head}>{p.lead}</li> : null}
                    {p.trial && !p.then ? (
                        <li className={head}>{p.trial}</li>
                    ) : null}
                    {shown.map(tick)}
                </ul>
                {folded.length ? (
                    // Open from 760px without script (`.mk-fold`); folded on a phone.
                    <details className="mk-fold group">
                        <summary
                            className={`flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-sm text-[15px] font-semibold min-[760px]:hidden [&::-webkit-details-marker]:hidden ${ring()}`}
                        >
                            All {p.lines.length} in {p.name}
                            <ChevronDown
                                aria-hidden
                                className="size-4 transition-transform duration-base group-open:rotate-180 motion-reduce:transition-none"
                            />
                        </summary>
                        <ul className={listClass}>{folded.map(tick)}</ul>
                    </details>
                ) : null}
            </div>
        </div>
    );
}
