import { Button } from "@saroh/ui/button";
import {
    EmptyState,
    FailedState,
    PermissionDeniedState,
} from "@saroh/ui/data-state";
import { ChevronRight, Wallet } from "lucide-react";
import Link from "next/link";

import type { SourceRead, TakingsRead } from "@/lib/analytics/takings";
import type { TakingsFigures } from "@/lib/analytics/takings-figures";
import { takingsFigures } from "@/lib/analytics/takings-figures";
import type { RowsLink } from "@/lib/analytics/takings-words";
import {
    chartLabel,
    dayMonth,
    HOW_TAKINGS_ARE_COUNTED,
    ordersHref,
    otherCurrencyNote,
    placeName,
    soFarReadout,
    sourceLine,
    spanLabel,
    sparkLabel,
    splitLabel,
    takingsAnswers,
    takingsSubtitle,
    takingsTiles,
    weekReadout,
} from "@/lib/analytics/takings-words";
import { newOrderHref } from "@/lib/orders/links";

import type { ReadoutBar } from "./readout-bars";
import { ReadoutBars } from "./readout-bars";
import { barTone, PlaceSplit, SO_FAR, WeekSpark } from "./takings-marks";

/**
 * Insights' takings (DEC-075), as the owner chose from the Insights
 * Variants design: 1a "Answers, in words" on top, 1b "Figures, laid out"
 * underneath for anyone who wants to check the working — at the page's
 * full width (owner, 2026-10-04), the sentences held to a reading measure.
 * Every sentence, note and readout comes from
 * `lib/analytics/takings-words.ts`, written from the same figures the bars
 * draw, and every figure with rows behind it opens them.
 *
 * Its states: the answers and figures; a business that has never taken
 * money (said once, with the two ways to take some); one whose first money
 * came this week (that week, so far); a role that may not see payments
 * (explained); a read that failed (said, with a retry). The page's loading
 * shape is `analytics/loading.tsx`.
 */
export function TakingsSection({ read }: { read: SourceRead<TakingsRead> }) {
    return (
        <section aria-labelledby="takings-heading">
            <h2
                id="takings-heading"
                className="font-display text-[19px] font-semibold tracking-[-0.025em]"
            >
                Sales
            </h2>
            <TakingsBody read={read} />
        </section>
    );
}

function TakingsBody({ read }: { read: SourceRead<TakingsRead> }) {
    if (read.status === "denied") {
        return (
            <PermissionDeniedState
                className="mt-3"
                title="Sales need access to payments"
                description="Your role can open Insights but not the business's payments, so its sales aren't shown here. The website's figures below are still yours to see."
                note="An owner or admin can add “See payments” to your role in Settings › Team."
            />
        );
    }
    if (read.status === "failed") {
        return (
            <FailedState
                className="mt-3"
                title="Sales could not be loaded"
                description="Something went wrong on our side, so this part of Insights is missing. Nothing has been changed."
                action={
                    <Button asChild variant="outline">
                        <Link href="/analytics">Try again</Link>
                    </Button>
                }
            />
        );
    }
    const figures = takingsFigures(read.data);
    if (figures.state === "NO_SALES") {
        return (
            <EmptyState
                className="mt-3"
                icon={<Wallet />}
                title="No money has come in yet"
                description="Your first paid order or invoice shows here the week it's paid: what came in, where it was sold and how this week is going."
                action={
                    <div className="flex flex-wrap justify-center gap-2">
                        <Button asChild>
                            <Link href={newOrderHref()}>Take an order</Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link href="/billing/invoices/new">
                                Send an invoice
                            </Link>
                        </Button>
                    </div>
                }
            />
        );
    }
    return (
        <>
            <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground">
                {figures.state === "SALES"
                    ? takingsSubtitle(figures)
                    : "Your first week, so far. Whole weeks join once they end, on Sunday."}
            </p>
            <div className="mt-4 space-y-4">
                <Answers figures={figures} />
                {figures.state === "SALES" ? (
                    <Figures figures={figures} />
                ) : null}
            </div>
        </>
    );
}

function RowsLinkTo({ link }: { link: RowsLink }) {
    return (
        <Link
            href={link.href}
            className="mt-1.5 inline-flex min-h-11 items-center gap-0.5 rounded-md text-[13px] font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:mt-0"
        >
            {link.label}
            <ChevronRight aria-hidden className="size-4" />
        </Link>
    );
}

/** 1a: the questions, answered in words. */
function Answers({ figures }: { figures: TakingsFigures }) {
    const answers = takingsAnswers(figures);
    const other = otherCurrencyNote(figures);
    return (
        <div
            data-testid="takings-answers"
            className="overflow-hidden rounded-[14px] border border-border bg-card"
        >
            {answers.map((a) => {
                const visual =
                    a.key === "month" && figures.state === "SALES" ? (
                        <WeekSpark
                            bars={figures.bars}
                            label={sparkLabel(figures)}
                            lastLabel={`Last 4 weeks · ${spanLabel(figures.last4)}`}
                            priorLabel={`The 4 before · ${spanLabel(figures.prior4)}`}
                        />
                    ) : a.key === "where" ? (
                        <PlaceSplit
                            places={figures.places}
                            label={splitLabel(figures.places)}
                            name={placeName}
                        />
                    ) : null;
                return (
                    <div
                        key={a.key}
                        className="border-b border-foreground/10 px-[19px] py-[17px]"
                    >
                        <div className="max-w-[68ch]">
                            <h3 className="mb-1.5 text-[12.5px] font-normal text-muted-foreground">
                                {a.question}
                            </h3>
                            <p
                                className={
                                    visual
                                        ? "mb-[11px] text-[15px] font-medium tabular-nums leading-[1.45]"
                                        : "text-[15px] font-medium tabular-nums leading-[1.45]"
                                }
                            >
                                {a.answer}
                            </p>
                        </div>
                        {visual ? (
                            <div className="max-w-3xl">{visual}</div>
                        ) : null}
                        {a.link ? <RowsLinkTo link={a.link} /> : null}
                    </div>
                );
            })}
            <div className="px-[19px] py-[14px] text-xs leading-[1.5] text-muted-foreground">
                <p>
                    {sourceLine(figures)}
                    {other ? ` ${other}` : ""}
                </p>
                <details className="group mt-1">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-0.5 rounded-md font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                        How sales are counted
                        <ChevronRight
                            aria-hidden
                            className="size-4 transition-transform duration-150 group-open:rotate-90"
                        />
                    </summary>
                    <ul className="mb-1 mt-1 max-w-[68ch] list-disc space-y-1 pl-4">
                        {HOW_TAKINGS_ARE_COUNTED.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </details>
            </div>
        </div>
    );
}

/** 1b: the four figures, each opening its orders, then the weeks drawn. */
function Figures({ figures }: { figures: TakingsFigures }) {
    const tiles = takingsTiles(figures);
    const bars: ReadoutBar[] = [
        ...figures.bars.map((bar, i) => ({
            key: bar.start,
            heightPercent: bar.heightPercent,
            tone: barTone(bar),
            readout: weekReadout(bar, figures.currency),
            link: {
                href: ordersHref(bar.start, bar.end),
                label: "Orders placed that week",
            },
            ...(i === 0 ? { tick: dayMonth(bar.start) } : {}),
        })),
        {
            key: "so-far",
            heightPercent: figures.soFar.heightPercent,
            tone: SO_FAR,
            readout: soFarReadout(figures),
            link: {
                href: ordersHref(figures.soFar.start, figures.soFar.through),
                label: "This week's orders",
            },
            apart: true,
            tick: "This week",
        },
    ];
    return (
        <div
            data-testid="takings-figures"
            className="rounded-[14px] border border-border bg-card px-[19px] py-[18px]"
        >
            <ul className="mb-4 grid grid-cols-2 gap-[11px] md:grid-cols-4">
                {tiles.map((t) => (
                    <li key={t.key} className="min-w-0">
                        <Link
                            href={t.href}
                            className="group flex h-full flex-col rounded-[11px] border border-border px-[13px] py-3 transition-colors duration-150 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="flex items-center justify-between gap-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                                {t.label}
                                <ChevronRight
                                    aria-hidden
                                    className="size-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
                                />
                            </span>
                            <span className="mt-1.5 font-display text-[19px] font-semibold tabular-nums tracking-[-0.03em] text-foreground [overflow-wrap:anywhere] min-[380px]:text-[22px]">
                                {t.value}
                            </span>
                            <span className="mt-[3px] text-xs leading-[1.45] text-muted-foreground">
                                {t.note}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
            <h3 className="mb-[11px] text-[12.5px] font-semibold">
                Sales, twelve weeks and this week so far
            </h3>
            <ReadoutBars
                bars={bars}
                label={`${chartLabel(figures)} This week so far is drawn hatched, apart. Choose a bar to read it.`}
                initial={figures.best?.start ?? "so-far"}
                tall
            />
        </div>
    );
}
