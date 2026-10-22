import { Button } from "@saroh/ui/button";
import {
    EmptyState,
    FailedState,
    PermissionDeniedState,
} from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronUp, IndianRupee } from "lucide-react";
import Link from "next/link";

import { WHO_CAN_CHANGE } from "@/components/shared/states/who-can-change";
import type { SourceRead } from "@/lib/analytics/takings";
import type { MoneyTile } from "@/lib/insights/money-words";
import {
    lastSevenDays,
    moneyTabAnswer,
    moneyTiles,
    moneyWeekBars,
    otherCurrencyNote,
    owedView,
    placesView,
} from "@/lib/insights/money-words";
import { sourceLine } from "@/lib/insights/overview-words";
import type { MoneyRead } from "@/lib/insights/reads";
import { newOrderHref } from "@/lib/orders/links";

import { AnswerCard, AnswerLink, AnswerText } from "./answer-card";
import { MoneyChart } from "./money-chart";
import { HowCounted } from "./overview";
import { OwedByAge } from "./owed-by-age";

/**
 * Insights' Money tab (DEC-171, plan U12, #1093; boards `IBMoneyD`,
 * `IBWeekD`, `IBOwedD` and their phone twins), for the page's period:
 *
 * 1. "Am I making more money?": the answer, then rolling weeks ending today,
 *    the period dark and the one before light, the best labelled; a bar
 *    opens that week's orders (`MoneyChart`, `WeekSheet`);
 * 2. four figures, each opening its rows: Money in, Paid orders and bills,
 *    An order is usually, Best week;
 * 3. How were the last 7 days, Where the money comes from (each place
 *    opening its own orders), Who owes me by how late (each age opening its
 *    bills, `OwedByAge`);
 * 4. how it's counted, and what it was counted from.
 *
 * It replaced today's takings (DEC-075) and keeps everything they offered:
 * every bar read by tap, focus or pointer and opening its orders; sales,
 * orders, best week and the usual order, each a link; where it came from;
 * the other-currency note under the chart; How these are counted.
 *
 * Its states: a role without payments is told who can show them money
 * (`IBMemberD`); a read that failed is said with Try again; a business that
 * has never taken money is told so once, with the two ways to take some,
 * and still sees who owes it; a young business says there is nothing
 * earlier to compare with yet.
 */
export function MoneyTab({
    money,
    retryHref,
    canRemind,
}: {
    money: SourceRead<MoneyRead> | null;
    /** This tab and period again, for Try again. */
    retryHref: string;
    /** `invoice:write`: Send reminder on a late bill. */
    canRemind: boolean;
}) {
    if (!money || money.status === "denied") {
        return (
            <div className="flex flex-col gap-5" data-testid="money-tab">
                <AnswerCard
                    question="Am I making more money?"
                    tone="deny"
                    data-testid="money-denied"
                >
                    <PermissionDeniedState
                        size="inline"
                        icon={null}
                        title="Money is shown to people who can see payments"
                        note={WHO_CAN_CHANGE}
                        className="text-base font-medium leading-[1.45] text-foreground"
                    />
                </AnswerCard>
                <HowCounted />
            </div>
        );
    }
    if (money.status === "failed") {
        return (
            <div className="flex flex-col gap-5" data-testid="money-tab">
                <FailedState
                    data-ph-unmask=""
                    size="panel"
                    title={couldntLoad("money")}
                    retryHref={retryHref}
                />
            </div>
        );
    }
    const read = money.data;
    const owed = owedView(read);
    const owedCard = owed ? (
        <OwedByAge
            text={owed.text}
            rows={owed.rows}
            href={owed.href}
            zone={read.zone}
            canRemind={canRemind}
        />
    ) : null;

    if (!read.hasSales) {
        return (
            <div className="flex flex-col gap-5" data-testid="money-tab">
                <EmptyState
                    size="page"
                    className="bg-card"
                    icon={<IndianRupee />}
                    title="Your first sale shows here the week it's paid"
                    description="Then Money says how each week went, where the money comes from and who owes you."
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
                {owedCard ? (
                    <div className="grid items-start gap-4 lg:grid-cols-3">
                        {owedCard}
                    </div>
                ) : null}
                <HowCounted />
            </div>
        );
    }

    const { bars, chart, initial } = moneyWeekBars(read);
    const week = lastSevenDays(read);
    const places = placesView(read);
    return (
        <div className="flex flex-col gap-5" data-testid="money-tab">
            <AnswerCard
                question="Am I making more money?"
                data-testid="money-answer"
            >
                <WideAnswer read={read} />
                <MoneyChart
                    bars={bars}
                    chart={chart}
                    initial={initial}
                    read={read}
                    note={otherCurrencyNote(read)}
                />
            </AnswerCard>
            <Tiles tiles={moneyTiles(read)} />
            <div className="grid items-start gap-4 lg:grid-cols-3">
                {week ? (
                    <AnswerCard
                        question="How were the last 7 days?"
                        data-testid="money-week"
                    >
                        <AnswerText answer={week.text} />
                        <AnswerLink href={week.href}>
                            See those orders
                        </AnswerLink>
                    </AnswerCard>
                ) : null}
                {places ? (
                    <AnswerCard
                        question="Where does the money come from?"
                        data-testid="money-places"
                    >
                        <AnswerText answer={places.text} />
                        <Places places={places} />
                    </AnswerCard>
                ) : null}
                {owedCard}
            </div>
            <HowCounted />
            <p
                data-ph-mask=""
                className="-mt-3.5 text-xs leading-[1.5] text-muted-foreground"
            >
                {sourceLine(read)}
            </p>
        </div>
    );
}

/** The answer in the display face (`IBMoneyD`: 22px, 18px on a phone). */
function WideAnswer({ read }: { read: MoneyRead }) {
    const { lead, text } = moneyTabAnswer(read);
    return (
        <p
            data-ph-mask=""
            className="max-w-[680px] text-pretty font-display text-lg font-semibold tabular-nums leading-[1.3] tracking-[-0.02em] desk:text-[22px]"
        >
            {lead ? <b className="font-bold">{lead}</b> : null}
            {lead ? " " : null}
            {text}
        </p>
    );
}

/** The four figures, each opening its rows. */
function Tiles({ tiles }: { tiles: readonly MoneyTile[] }) {
    return (
        <ul
            className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3"
            data-testid="money-tiles"
        >
            {tiles.map((tile) => (
                <li key={tile.key} className="min-w-0">
                    <Link
                        href={tile.href}
                        data-tile={tile.key}
                        className="flex h-full flex-col gap-[3px] rounded-xl border border-border bg-card px-[15px] py-[13px] text-foreground transition-colors duration-fast hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-muted"
                    >
                        <span
                            data-ph-unmask=""
                            className="text-[12.5px] text-muted-foreground"
                        >
                            {tile.label}
                        </span>
                        <span
                            data-ph-mask=""
                            className="font-display text-[21px] font-semibold tabular-nums tracking-[-0.02em] [overflow-wrap:anywhere]"
                        >
                            {tile.value}
                        </span>
                        <span
                            data-ph-mask=""
                            data-tone={tile.tone ?? undefined}
                            className={cn(
                                "inline-flex items-start gap-[3px] text-pretty text-xs leading-[1.4]",
                                tile.tone === "up"
                                    ? "text-success-subtle-foreground"
                                    : tile.tone === "bad"
                                      ? "font-semibold text-destructive-subtle-foreground"
                                      : "text-neutral-700 dark:text-muted-foreground",
                            )}
                        >
                            {tile.tone === "up" ? (
                                <ChevronUp
                                    aria-hidden
                                    className="mt-px size-3.5 shrink-0"
                                />
                            ) : null}
                            {tile.sub}
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}

/** The design's place colours, largest first: ink, Clay, Saffron, then greys. */
const PLACE = [
    "bg-foreground",
    "bg-brand",
    "bg-brand-500",
    "bg-neutral-300 dark:bg-neutral-500",
    "bg-neutral-200 dark:bg-neutral-700",
];

function Places({
    places,
}: {
    places: NonNullable<ReturnType<typeof placesView>>;
}) {
    return (
        <div className="grid w-full gap-2" data-ph-mask="">
            <div
                role="img"
                aria-label={places.label}
                className="flex h-3 w-full gap-0.5 overflow-hidden rounded-md"
            >
                {places.places.map((p, i) => (
                    <span
                        key={p.key}
                        className={PLACE[i % PLACE.length]}
                        style={{ width: `${p.percent}%` }}
                    />
                ))}
            </div>
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-700 dark:text-muted-foreground">
                {places.places.map((p, i) => (
                    <li key={p.key}>
                        <Link
                            href={p.href}
                            className="inline-flex items-center gap-1.5 rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "inline-block size-2.5 rounded-[2px]",
                                    PLACE[i % PLACE.length],
                                )}
                            />
                            <span className="tabular-nums">
                                {p.name} {p.amount}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
