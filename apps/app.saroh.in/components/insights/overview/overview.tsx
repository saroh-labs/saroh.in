import { Button } from "@saroh/ui/button";
import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight, IndianRupee, Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PartialRead } from "@/components/shared/states/failed-read";
import { WHO_CAN_CHANGE } from "@/components/shared/states/who-can-change";
import type { AnalyticsSummary } from "@/lib/analytics/summary";
import type { SourceRead } from "@/lib/analytics/takings";
import type { MoneyBar, OverviewPart } from "@/lib/insights/overview-words";
import {
    fromAnswer,
    HOW_INSIGHTS_ARE_COUNTED,
    moneyAnswer,
    moneyChart,
    partialWords,
    sellsAnswer,
    sellsRows,
    sourceLine,
    thinBars,
    thinOrdersHref,
} from "@/lib/insights/overview-words";
import type { InsightsAddress } from "@/lib/insights/period";
import { insightsHref } from "@/lib/insights/period";
import type { MoneyRead, SellsRead, SourcesRead } from "@/lib/insights/reads";
import {
    countedFromLine,
    overviewSourceRows,
    overviewSourcesAnswer,
} from "@/lib/insights/sources-words";
import { newOrderHref } from "@/lib/orders/links";

import { AnswerCard, AnswerLink, AnswerText } from "./answer-card";

/**
 * Insights' Overview (DEC-171, plan U10, #1089): one suggestion at a time,
 * then three answers, each leading to its tab, then how they are counted.
 * Boards: `IBOverviewD`/`P` (4 weeks), `IBPeriodD` (7 days, a bar a day),
 * `IBThinD`/`P` (first weeks), `IBNoSalesD`/`P` (no sale yet), `IBMemberD`/`P`
 * (Insights without payments: counts only), `IBFailedD`/`P` (one part
 * couldn't load).
 *
 * The three are read apart and fail apart: a part that couldn't be read is
 * named once, above, with Try again, and its card says so; the rest shows.
 * Money that the role may not see is said in words, never shown as ₹0.
 *
 * `suggestion` is the "What to do next" card's place (U11, #1091): above
 * the answers, or beside the website's answer before the first sale.
 */
export interface OverviewProps {
    address: InsightsAddress;
    money: SourceRead<MoneyRead> | null;
    sells: SourceRead<SellsRead> | null;
    website: SourceRead<AnalyticsSummary>;
    /** Where visits came from (U16); null or failed: the website's figures alone. */
    sources?: SourceRead<SourcesRead> | null;
    suggestion?: ReactNode;
}

export function Overview({
    address,
    money,
    sells,
    website,
    sources = null,
    suggestion = null,
}: OverviewProps) {
    const href = (tab: InsightsAddress["tab"]) =>
        insightsHref({ ...address, tab });
    const parts: [OverviewPart, SourceRead<unknown> | null][] = [
        ["money", money],
        ["sells", sells],
        ["website", website],
    ];
    const failed = parts
        .filter(([, read]) => read?.status === "failed")
        .map(([part]) => part);
    const shown = parts
        .filter(([, read]) => read?.status === "ok")
        .map(([part]) => part);
    const partial =
        failed.length > 0 ? (
            <PartialRead {...partialWords(failed, shown)} />
        ) : null;

    const noSales = money?.status === "ok" && !money.data.hasSales;
    const fromCard = (
        <FromCard
            website={website}
            sources={sources?.status === "ok" ? sources.data : null}
            period={address.period}
            noSales={noSales}
            href={href("from")}
        />
    );

    if (noSales) {
        return (
            <div
                className="flex flex-col gap-5"
                data-testid="insights-overview"
            >
                {partial}
                <EmptyState
                    size="page"
                    className="bg-card"
                    icon={<IndianRupee />}
                    title="Your first sale shows here the week it's paid"
                    description="Then Insights says how each week went, what sells and where customers come from."
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
                <div className="grid items-start gap-4 lg:grid-cols-2">
                    {suggestion}
                    {fromCard}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5" data-testid="insights-overview">
            {partial}
            {suggestion}
            <div className="grid items-start gap-4 lg:grid-cols-3">
                <MoneyCard money={money} href={href("money")} />
                <SellsCard sells={sells} href={href("sells")} />
                {fromCard}
            </div>
            <HowCounted />
            {money?.status === "ok" ? (
                <p
                    data-ph-mask=""
                    className="-mt-3.5 text-xs leading-[1.5] text-muted-foreground"
                >
                    {sourceLine(money.data)}
                </p>
            ) : null}
        </div>
    );
}

/** "Couldn't load just now.": the notice above says what and offers Try again. */
function CouldntLoad() {
    return (
        <p data-ph-unmask="" className="text-base font-medium leading-[1.45]">
            Couldn't load just now.
        </p>
    );
}

const QUESTION = {
    money: "Am I making more money?",
    sells: "What sells, who books?",
    from: "Where do customers come from?",
} as const;

function MoneyCard({
    money,
    href,
}: {
    money: SourceRead<MoneyRead> | null;
    href: string;
}) {
    if (!money || money.status === "denied") {
        // `IBMemberD`: a role with Insights and without payments.
        return (
            <AnswerCard
                question={QUESTION.money}
                tone="deny"
                data-testid="answer-money"
            >
                <PermissionDeniedState
                    size="inline"
                    icon={null}
                    title="Money is shown to people who can see payments"
                    note={WHO_CAN_CHANGE}
                    className="text-base font-medium leading-[1.45] text-foreground"
                />
            </AnswerCard>
        );
    }
    if (money.status === "failed") {
        return (
            <AnswerCard
                question={QUESTION.money}
                tone="off"
                data-testid="answer-money"
            >
                <CouldntLoad />
            </AnswerCard>
        );
    }
    const read = money.data;
    if (read.thin) {
        return (
            <AnswerCard question={QUESTION.money} data-testid="answer-money">
                <AnswerText answer={moneyAnswer(read)} />
                <ColumnBars
                    bars={thinBars(read)}
                    label="Money in each of your first weeks."
                    className="max-w-[420px] gap-2.5"
                />
                <AnswerLink href={thinOrdersHref(read)}>
                    See the orders
                </AnswerLink>
            </AnswerCard>
        );
    }
    const chart = moneyChart(read);
    return (
        <AnswerCard question={QUESTION.money} data-testid="answer-money">
            <AnswerText answer={moneyAnswer(read)} />
            {chart.kind === "days" ? (
                <ColumnBars bars={chart.bars} label={chart.label} />
            ) : (
                <WeekChart chart={chart} />
            )}
            <AnswerLink href={href}>See money</AnswerLink>
        </AnswerCard>
    );
}

const TONE: Record<MoneyBar["tone"], string> = {
    now: "bg-foreground",
    before: "bg-neutral-300 dark:bg-neutral-500",
    old: "bg-neutral-200 dark:bg-neutral-700",
};

const BEST = "bg-brand";

/**
 * Bars standing in a row with their own tick under each: the last 7 days
 * (`IBPeriodD`) and a young business's weeks (`IBThinD`). A picture: the
 * sentence above says the figures, and the label says them again.
 */
function ColumnBars({
    bars,
    label,
    className,
}: {
    bars: readonly MoneyBar[];
    label: string;
    className?: string;
}) {
    return (
        <div
            role="img"
            aria-label={label}
            data-ph-mask=""
            className={cn("flex h-[120px] w-full items-end gap-2", className)}
        >
            {bars.map((bar) => (
                <span
                    key={bar.key}
                    className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                >
                    <span
                        className={cn(
                            "block w-full rounded-t-[4px]",
                            bar.heightPercent > 0
                                ? TONE[bar.tone]
                                : "bg-border",
                        )}
                        style={{
                            height:
                                bar.heightPercent > 0
                                    ? `${bar.heightPercent}%`
                                    : "2px",
                        }}
                    />
                    <small className="text-[11.5px] text-muted-foreground">
                        {bar.tick}
                    </small>
                </span>
            ))}
        </div>
    );
}

/**
 * The twelve weeks (`IBOverviewD`): the period dark, the one before light,
 * earlier faint, the best in Clay with its amount over it; three dashed
 * lines of scale; four dates under; the legend.
 */
function WeekChart({ chart }: { chart: ReturnType<typeof moneyChart> }) {
    const best = chart.bars.find((b) => b.best);
    return (
        <div className="grid w-full gap-1.5" data-ph-mask="">
            <div
                role="img"
                aria-label={chart.label}
                className="relative h-[120px] w-full"
            >
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex flex-col justify-between"
                >
                    {chart.grid.map((line, i) => (
                        <span
                            key={i}
                            className="block border-t border-dashed border-border pt-0.5 text-right text-[10.5px] leading-none text-muted-foreground"
                        >
                            {line}
                        </span>
                    ))}
                </div>
                <div
                    aria-hidden
                    className="absolute inset-0 flex items-end gap-[3px] pr-[30px] sm:gap-[5px] sm:pr-[34px]"
                >
                    {chart.bars.map((bar) => (
                        <span
                            key={bar.key}
                            className="flex h-full min-w-0 flex-1 items-end"
                        >
                            <span
                                className={cn(
                                    "relative block w-full rounded-t-[4px]",
                                    bar.best ? BEST : TONE[bar.tone],
                                )}
                                style={{
                                    height: `${Math.max(bar.heightPercent, bar.heightPercent > 0 ? 1 : 0)}%`,
                                }}
                            >
                                {bar === best ? (
                                    <span className="absolute -top-[19px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-foreground">
                                        {bar.short}
                                    </span>
                                ) : null}
                            </span>
                        </span>
                    ))}
                </div>
            </div>
            <div
                aria-hidden
                className="flex justify-between pr-[30px] text-[11.5px] text-muted-foreground sm:pr-[34px]"
            >
                {chart.bars
                    .filter((b) => b.tick)
                    .map((b) => (
                        <span key={b.key}>{b.tick}</span>
                    ))}
            </div>
            {chart.legend.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {chart.legend.map((item, i) => (
                        <span
                            key={item.tone}
                            className="inline-flex items-center gap-1.5"
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "inline-block size-2.5 rounded-[2px]",
                                    i > 0 && "ml-2",
                                    TONE[item.tone],
                                )}
                            />
                            {item.label}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** "What sells, who books?": the What sells tab says more (`sells-tab.tsx`). */
export function SellsCard({
    sells,
    href,
}: {
    sells: SourceRead<SellsRead> | null;
    href: string;
}) {
    if (sells?.status !== "ok") {
        return (
            <AnswerCard
                question={QUESTION.sells}
                tone="off"
                data-testid="answer-sells"
            >
                <CouldntLoad />
            </AnswerCard>
        );
    }
    const rows = sellsRows(sells.data);
    return (
        <AnswerCard question={QUESTION.sells} data-testid="answer-sells">
            <AnswerText answer={sellsAnswer(sells.data)} />
            {rows.length > 0 ? (
                <ol className="w-full" data-ph-mask="">
                    {rows.map((row, i) => (
                        <li
                            key={row.key}
                            className="flex items-center gap-2.5 border-t border-border/70 py-2 text-[13.5px]"
                        >
                            <span
                                aria-hidden
                                className="flex size-5 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[11px] font-bold dark:bg-neutral-800"
                            >
                                {i + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-semibold">
                                {row.name}
                            </span>
                            <span className="shrink-0 text-[12.5px] text-muted-foreground">
                                {row.qty}
                            </span>
                            {row.amount !== null ? (
                                <span className="min-w-[70px] shrink-0 text-right font-semibold tabular-nums">
                                    {row.amount}
                                </span>
                            ) : null}
                        </li>
                    ))}
                </ol>
            ) : null}
            <AnswerLink href={href}>See what sells</AnswerLink>
        </AnswerCard>
    );
}

/**
 * "Where do customers come from?" (`IBOverviewD`, U16 #1101): the source
 * that brings the most and how many visits ended in a payment, the first
 * three sources, and the website's figures under them as before. Before
 * any source is counted, or in a period with no visit, the website's
 * figures answer alone, with when counting begins. A sources read that
 * failed leaves the website's answer as it was; the tab names the failure.
 */
function FromCard({
    website,
    sources,
    period,
    noSales,
    href,
}: {
    website: SourceRead<AnalyticsSummary>;
    sources: SourcesRead | null;
    period: InsightsAddress["period"];
    noSales: boolean;
    href: string;
}) {
    if (website.status !== "ok") {
        return (
            <AnswerCard
                question={QUESTION.from}
                tone="off"
                data-testid="answer-from"
            >
                <CouldntLoad />
            </AnswerCard>
        );
    }
    const figures = fromAnswer(website.data, period, noSales);
    const answer = sources ? overviewSourcesAnswer(sources) : null;
    const rows = answer && sources ? overviewSourceRows(sources) : [];
    const notYet =
        sources && !answer && !noSales ? countedFromLine(sources) : null;
    return (
        <AnswerCard question={QUESTION.from} data-testid="answer-from">
            <AnswerText answer={answer ?? figures} />
            {rows.length > 0 ? (
                <ol className="w-full" data-ph-mask="">
                    {rows.map((row, i) => (
                        <li
                            key={row.key}
                            className="flex items-center gap-2.5 border-t border-border/70 py-2 text-[13.5px]"
                        >
                            <span
                                aria-hidden
                                className="flex size-5 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[11px] font-bold dark:bg-neutral-800"
                            >
                                {i + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-semibold">
                                {row.name}
                            </span>
                            <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
                                {row.visits}
                            </span>
                        </li>
                    ))}
                </ol>
            ) : null}
            {answer ? (
                <p
                    data-ph-mask=""
                    data-testid="answer-from-figures"
                    className="text-[12.5px] leading-[1.45] text-muted-foreground"
                >
                    {figures}
                </p>
            ) : notYet ? (
                <p
                    data-ph-unmask=""
                    className="flex items-start gap-1.5 text-[12.5px] leading-[1.45] text-muted-foreground"
                >
                    <Info aria-hidden className="mt-px size-[15px] shrink-0" />
                    {notYet}
                </p>
            ) : null}
            <AnswerLink href={href}>See your website</AnswerLink>
        </AnswerCard>
    );
}

/** "How these are counted", folded, at the foot of the Overview. */
export function HowCounted() {
    return (
        <details className="group" data-ph-unmask="">
            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-0.5 rounded-md text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11 [&::-webkit-details-marker]:hidden">
                How these are counted
                <ChevronRight
                    aria-hidden
                    className="size-3.5 transition-transform duration-base group-open:rotate-90"
                />
            </summary>
            <ul className="mb-1 mt-1 max-w-[68ch] list-disc space-y-1 pl-4 text-xs leading-[1.5] text-muted-foreground">
                {HOW_INSIGHTS_ARE_COUNTED.map((line) => (
                    <li key={line}>{line}</li>
                ))}
            </ul>
        </details>
    );
}
