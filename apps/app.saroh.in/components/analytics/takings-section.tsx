import { Button } from "@saroh/ui/button";
import {
    EmptyState,
    FailedState,
    PermissionDeniedState,
} from "@saroh/ui/data-state";
import { Wallet } from "lucide-react";
import Link from "next/link";

import type { SourceRead, TakingsRead } from "@/lib/analytics/takings";
import type { TakingsFigures } from "@/lib/analytics/takings-figures";
import { takingsFigures } from "@/lib/analytics/takings-figures";
import {
    chartLabel,
    dayMonth,
    otherCurrencyNote,
    placeName,
    splitLabel,
    takingsAnswers,
    takingsSubtitle,
    takingsTiles,
} from "@/lib/analytics/takings-words";

import { PlaceSplit, WeekBars } from "./takings-marks";

/**
 * Insights' takings (DEC-075), as the owner chose from the Insights
 * Variants design: 1a "Answers, in words" on top, 1b "Figures, laid out"
 * underneath for anyone who wants to check the working. Every sentence and
 * every note comes from `lib/analytics/takings-words.ts`, written from the
 * same figures the bars draw.
 *
 * Its states: the answers and figures; a business with nothing on record
 * (one honest sentence, and "No takings yet" where the figures would be);
 * a role that may not see payments (explained); a read that failed (said,
 * with a retry). The page's loading shape is `analytics/loading.tsx`.
 */
export function TakingsSection({ read }: { read: SourceRead<TakingsRead> }) {
    return (
        <section aria-labelledby="takings-heading" className="max-w-2xl">
            <h2
                id="takings-heading"
                className="font-display text-[19px] font-semibold tracking-[-0.025em]"
            >
                Takings
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
                title="Takings need access to payments"
                description="Your role can open Insights but not the business's payments, so its takings aren't shown here. The website's figures below are still yours to see."
                note="An owner or admin can add “See payments” to your role in Settings › Team."
            />
        );
    }
    if (read.status === "failed") {
        return (
            <FailedState
                className="mt-3"
                title="Takings could not be loaded"
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
    return (
        <>
            {figures.state === "SALES" ? (
                <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground">
                    {takingsSubtitle(figures)}
                </p>
            ) : null}
            <div className="mt-4 space-y-4">
                <Answers figures={figures} />
                {figures.state === "SALES" ? (
                    <Figures figures={figures} />
                ) : (
                    <EmptyState
                        icon={<Wallet />}
                        title={
                            figures.state === "NOT_YET"
                                ? "Your first week is under way"
                                : "No takings yet"
                        }
                        description={
                            figures.state === "NOT_YET"
                                ? "The figures fill in once this week ends, on Sunday."
                                : "When an order or an invoice is paid, its week shows here: what came in, where it was sold and your best week."
                        }
                    />
                )}
            </div>
        </>
    );
}

/** 1a: two to four questions, answered in words. */
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
                        <WeekBars
                            size="spark"
                            bars={figures.bars}
                            label={chartLabel(figures)}
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
                        {visual}
                    </div>
                );
            })}
            <p className="px-[19px] py-[14px] text-[11.5px] leading-[1.5] text-muted-foreground">
                Every sentence is generated from the figures, so it cannot drift
                from them.{other ? ` ${other}` : ""}
            </p>
        </div>
    );
}

/** 1b: the four figures, then the twelve weeks drawn. */
function Figures({ figures }: { figures: TakingsFigures }) {
    const tiles = takingsTiles(figures);
    const first = figures.bars.at(0);
    const last = figures.bars.at(-1);
    return (
        <div
            data-testid="takings-figures"
            className="rounded-[14px] border border-border bg-card px-[19px] py-[18px]"
        >
            <dl className="mb-4 grid grid-cols-2 gap-[11px]">
                {tiles.map((t) => (
                    <div
                        key={t.key}
                        className="min-w-0 rounded-[11px] border border-border px-[13px] py-3"
                    >
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                            {t.label}
                        </dt>
                        <dd className="mt-1.5 font-display text-[19px] font-semibold tabular-nums tracking-[-0.03em] [overflow-wrap:anywhere] min-[380px]:text-[22px]">
                            {t.value}
                        </dd>
                        <dd className="mt-[3px] text-[11px] leading-[1.45] text-muted-foreground">
                            {t.note}
                        </dd>
                    </div>
                ))}
            </dl>
            <h3 className="mb-[11px] text-[12.5px] font-semibold">
                Takings, twelve weeks
            </h3>
            <WeekBars
                size="chart"
                bars={figures.bars}
                label={chartLabel(figures)}
            />
            <div
                aria-hidden
                className="mt-[7px] flex justify-between text-[11px] text-muted-foreground"
            >
                <span>{first ? dayMonth(first.start) : ""}</span>
                <span>{last ? dayMonth(last.start) : ""}</span>
            </div>
        </div>
    );
}
