import { AbsentValue } from "@saroh/ui/absent-value";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { ListTable, listTable, ListTableHead } from "@saroh/ui/list-table";
import { Notice } from "@saroh/ui/notice";
import { ProgressBar } from "@saroh/ui/progress-bar";
import { TextLink } from "@saroh/ui/text-link";
import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

import { WHO_CAN_CHANGE } from "@/components/shared/who-can-change";
import type { SourceRead } from "@/lib/analytics/takings";
import type { SellsRead } from "@/lib/insights/reads";
import type { ChangeView, SellsParts } from "@/lib/insights/sells-words";
import {
    bookedView,
    hiddenLine,
    partsShown,
    SEE_ALL,
    soldView,
} from "@/lib/insights/sells-words";
import { newOrderHref } from "@/lib/orders/links";

import { AnswerCard, AnswerLink, AnswerText } from "./answer-card";
import { BestCustomers } from "./best-customers";
import { BusiestGrid } from "./busiest-grid";
import { HowCounted } from "./overview";

/**
 * Insights' What sells tab (DEC-171, plan U13, #1095; boards `IBSellsD`,
 * `IBSellsP`, `IBSellsEmptyD`, `IBSellsEmptyP`), for the page's period,
 * four questions in two rows (one column on a phone):
 *
 * 1. What sells most? The top five products, each opening its page: sold,
 *    brought in, and the change against the period before, or New. A table
 *    at the desk; on a phone each product is a row with its figures under
 *    its name, so nothing hides sideways.
 * 2. What do people book? The services booked most, and how full each
 *    class was.
 * 3. When is it busiest? A grid of weekdays by parts of the day, with Show
 *    as a table (`BusiestGrid`).
 * 4. Who are my best customers? (`BestCustomers`)
 *
 * A business that only sells sees no bookings, and one that only books no
 * best sellers (`parts`, from what is turned on); each part can be empty
 * on its own. A role without payments sees counts, one without customers'
 * names sees nobody named, and the one notice above says so (DEC-098).
 * The first weeks say there is nothing earlier to compare with (`IBThinD`).
 */
export function SellsTab({
    sells,
    retryHref,
    parts,
    can,
}: {
    sells: SourceRead<SellsRead> | null;
    /** This tab and period again, for Try again. */
    retryHref: string;
    /** What the business has turned on; null when that isn't known. */
    parts: SellsParts | null;
    /** The empty cards' buttons, by the person's permissions. */
    can: { takeOrder: boolean; addService: boolean };
}) {
    if (sells?.status !== "ok") {
        return (
            <div className="flex flex-col gap-5" data-testid="sells-tab">
                <FailedState
                    size="panel"
                    title={couldntLoad("what sells")}
                    retryHref={retryHref}
                />
                <HowCounted />
            </div>
        );
    }
    const read = sells.data;
    const shown = partsShown(read, parts);
    const hidden = hiddenLine(read);
    return (
        <div className="flex flex-col gap-5" data-testid="sells-tab">
            {hidden ? (
                <Notice
                    tone="neutral"
                    data-ph-unmask=""
                    data-testid="sells-hidden"
                >
                    {hidden} {WHO_CAN_CHANGE}
                </Notice>
            ) : null}
            <div className="grid items-start gap-4 xl:grid-cols-2">
                {shown.sells ? (
                    <SoldCard read={read} canTakeOrder={can.takeOrder} />
                ) : null}
                {shown.books ? (
                    <BookedCard read={read} canAddService={can.addService} />
                ) : null}
                <BusiestGrid read={read} />
                <BestCustomers read={read} />
            </div>
            <HowCounted />
        </div>
    );
}

/** The change cell: up green, down red, New, about the same, or a dash. */
function Change({ change }: { change: ChangeView }) {
    if (change.kind === "new") {
        return (
            <Badge variant="neutral" size="sm">
                New
                <span className="sr-only">: {change.says}</span>
            </Badge>
        );
    }
    if (change.kind === "none") return <AbsentValue says={change.says} />;
    const Icon = change.kind === "up" ? ChevronUp : ChevronDown;
    return (
        <span
            data-change={change.kind}
            className={cn(
                "inline-flex items-center gap-0.5 text-[12.5px] font-semibold tabular-nums",
                change.kind === "up"
                    ? "text-success-subtle-foreground"
                    : change.kind === "down"
                      ? "text-destructive-subtle-foreground"
                      : "font-medium text-muted-foreground",
            )}
        >
            {change.kind === "same" ? null : (
                <Icon aria-hidden className="size-3.5 shrink-0" />
            )}
            <span aria-hidden>{change.text}</span>
            <span className="sr-only">{change.says}</span>
        </span>
    );
}

/**
 * The best sellers' columns at the desk: what, sold, brought in, the
 * change. Without money or a change, those columns go. Written out whole
 * so the compiler sees each, keyed by money then change.
 */
const SOLD_COLUMNS = {
    "11": "desk:grid-cols-[minmax(0,1fr)_64px_96px_minmax(96px,150px)]",
    "10": "desk:grid-cols-[minmax(0,1fr)_64px_96px]",
    "01": "desk:grid-cols-[minmax(0,1fr)_64px_minmax(96px,150px)]",
    "00": "desk:grid-cols-[minmax(0,1fr)_64px]",
} as const;

function SoldCard({
    read,
    canTakeOrder,
}: {
    read: SellsRead;
    canTakeOrder: boolean;
}) {
    const view = soldView(read);
    const cols =
        SOLD_COLUMNS[`${view.showAmount ? 1 : 0}${view.showChange ? 1 : 0}`];
    return (
        <AnswerCard question="What sells most?" data-testid="sells-sold">
            <AnswerText answer={view.answer} />
            {view.rows.length > 0 ? (
                <ListTable className="w-full">
                    <ListTableHead
                        className={cn("hidden gap-3 desk:grid", cols)}
                    >
                        <span>What</span>
                        <span className={listTable.numeric}>Sold</span>
                        {view.showAmount ? (
                            <span className={listTable.numeric}>
                                Brought in
                            </span>
                        ) : null}
                        {view.showChange ? (
                            <span>{view.changeHead}</span>
                        ) : null}
                    </ListTableHead>
                    <ul data-ph-mask="">
                        {view.rows.map((row) => (
                            <li
                                key={row.key}
                                data-row="sold"
                                className={cn(
                                    listTable.row,
                                    // A phone: the name, then its figures
                                    // on one line under it.
                                    "flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13.5px] desk:grid desk:gap-y-0",
                                    cols,
                                )}
                            >
                                <span className="min-w-0 basis-full font-semibold desk:basis-auto">
                                    <TextLink href={row.href}>
                                        {row.name}
                                    </TextLink>
                                </span>
                                <span className="tabular-nums max-desk:text-[12.5px] max-desk:text-muted-foreground desk:text-right">
                                    {row.sold}
                                    <span className="desk:sr-only"> sold</span>
                                </span>
                                {view.showAmount ? (
                                    <span className="font-semibold tabular-nums desk:text-right">
                                        {row.amount ?? <AbsentValue />}
                                        <span className="sr-only">
                                            {" "}
                                            brought in
                                        </span>
                                    </span>
                                ) : null}
                                {view.showChange ? (
                                    <span>
                                        <Change change={row.change} />
                                    </span>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </ListTable>
            ) : canTakeOrder ? (
                <Button asChild variant="outline" size="sm">
                    <Link href={newOrderHref()}>Take an order</Link>
                </Button>
            ) : null}
            {view.seeAll ? (
                <AnswerLink href={view.seeAll.href}>
                    {view.seeAll.label}
                </AnswerLink>
            ) : null}
        </AnswerCard>
    );
}

function BookedCard({
    read,
    canAddService,
}: {
    read: SellsRead;
    canAddService: boolean;
}) {
    const view = bookedView(read);
    return (
        <AnswerCard question="What do people book?" data-testid="sells-booked">
            <AnswerText answer={view.answer} />
            {view.rows.length > 0 ? (
                <ul className="grid w-full gap-3" data-ph-mask="">
                    {view.rows.map((row) => (
                        <li
                            key={row.key}
                            data-row="booked"
                            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-[3px] text-[13.5px]"
                        >
                            <span className="min-w-0 font-semibold">
                                {row.name}
                            </span>
                            <span className="text-[12.5px] font-semibold tabular-nums">
                                {row.fullText ?? (
                                    <AbsentValue says="One-to-one: no places to fill" />
                                )}
                            </span>
                            <span className="col-span-2 text-xs text-muted-foreground">
                                {row.line}
                            </span>
                            {row.fullPercent !== null ? (
                                <ProgressBar
                                    className="col-span-2"
                                    value={row.fullPercent}
                                    max={100}
                                    label={`${row.name}: ${row.fullText ?? ""}`}
                                />
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : view.empty && canAddService ? (
                <Button asChild variant="outline" size="sm">
                    <Link href={SEE_ALL.newService}>Add a service</Link>
                </Button>
            ) : null}
            {view.seeAll ? (
                <AnswerLink href={view.seeAll.href}>
                    {view.seeAll.label}
                </AnswerLink>
            ) : null}
        </AnswerCard>
    );
}
