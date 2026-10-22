import { AbsentValue } from "@saroh/ui/absent-value";
import type { LucideIcon } from "lucide-react";
import { Globe, Instagram, Link2, MessageCircle, Search } from "lucide-react";

import { joinFacts } from "@/lib/format/join";
import { formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import type { InsightsPeriod } from "@/lib/insights/period";
import type { SourcesRead, VisitSource } from "@/lib/insights/reads";
import {
    foldedLine,
    paidShares,
    SOURCE_NAME,
    sourcesAnswer,
} from "@/lib/insights/sources-words";

/**
 * "Where do visitors come from?" (DEC-171, plan U16, #1101; `IBFromD`,
 * `IBFromP`): each source's visits, how many paid, and how many of its
 * visits that is ("1 in 9"), with a bar against the source that did best.
 * A source with too few visits is counted in Other sites, and the line
 * under the table says which. The merchant's own links (`?ref=`), when
 * any were visited, are listed under it.
 *
 * On a phone the bar goes and the names may wrap, so the four columns fit
 * at 320px; the table never scrolls the page sideways.
 */

const ICON: Record<VisitSource, LucideIcon> = {
    instagram: Instagram,
    google: Search,
    whatsapp: MessageCircle,
    direct: Globe,
    other: Link2,
};

const TH =
    "whitespace-nowrap border-b border-border py-2 pr-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground last:pr-0";
const TD =
    "border-b border-border/70 py-2.5 pr-2 align-middle last:pr-0 group-last:border-b-0";

export function SourcesTable({
    read,
    period,
}: {
    read: Pick<
        SourcesRead,
        "sources" | "folded" | "refs" | "moreRefs" | "siteId"
    >;
    period: InsightsPeriod;
}) {
    const shares = paidShares(read.sources);
    const folded = foldedLine(read.folded);
    // Paid is per website since DEC-181 (the visit's own `site.paid`), so
    // a website chosen narrows it too and needs no note.
    const notes = [folded].filter((x): x is string => x !== null);
    return (
        <section
            aria-labelledby="sources-heading"
            data-testid="sources-table"
            className="flex min-w-0 flex-col items-start gap-2.5 rounded-[14px] border border-border bg-card px-4 py-4 sm:px-5 sm:py-[18px]"
        >
            <h3
                id="sources-heading"
                data-ph-unmask=""
                className="text-[13px] font-semibold text-muted-foreground"
            >
                Where do visitors come from?
            </h3>
            <p
                data-ph-mask=""
                className="max-w-[680px] text-pretty text-base font-medium leading-[1.45]"
            >
                {sourcesAnswer(read.sources, period)}
            </p>
            {read.sources.length > 0 ? (
                <div className="w-full min-w-0">
                    <table className="w-full border-collapse text-[13.5px]">
                        <thead data-ph-unmask="">
                            <tr>
                                <th scope="col" className={TH}>
                                    From
                                </th>
                                <th scope="col" className={TH}>
                                    Visits
                                </th>
                                <th scope="col" className={TH}>
                                    Paid
                                </th>
                                <th scope="col" className={TH}>
                                    How many paid
                                </th>
                            </tr>
                        </thead>
                        <tbody data-ph-mask="">
                            {read.sources.map((row, i) => {
                                const Icon = ICON[row.source];
                                const share = shares[i];
                                return (
                                    <tr
                                        key={row.source}
                                        className="group"
                                        data-source={row.source}
                                    >
                                        <th
                                            scope="row"
                                            className={`${TD} text-left font-semibold`}
                                        >
                                            <span className="inline-flex min-w-0 items-center gap-[7px]">
                                                <Icon
                                                    aria-hidden
                                                    className="size-4 shrink-0"
                                                />
                                                {SOURCE_NAME[row.source]}
                                            </span>
                                        </th>
                                        <td className={`${TD} tabular-nums`}>
                                            {formatNumber(row.visits)}
                                        </td>
                                        <td className={`${TD} tabular-nums`}>
                                            {formatNumber(row.paid)}
                                        </td>
                                        <td
                                            className={`${TD} whitespace-nowrap tabular-nums`}
                                        >
                                            <span
                                                aria-hidden
                                                className="mr-2 inline-block h-1.5 w-[60px] overflow-hidden rounded-[3px] bg-muted align-middle max-sm:hidden"
                                            >
                                                <span
                                                    className="block h-full bg-success"
                                                    style={{
                                                        width: `${share.widthPercent}%`,
                                                    }}
                                                />
                                            </span>
                                            {share.words ?? (
                                                <AbsentValue says="Not known" />
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : null}
            {notes.length > 0 ? (
                <p
                    data-testid="sources-note"
                    data-ph-unmask=""
                    className="text-xs leading-[1.5] text-muted-foreground"
                >
                    {notes.join(" ")}
                </p>
            ) : null}
            {read.refs.length > 0 ? (
                <div className="grid w-full gap-1" data-testid="sources-refs">
                    <h4
                        data-ph-unmask=""
                        className="text-[13px] font-semibold text-muted-foreground"
                    >
                        Your own links
                    </h4>
                    <ul className="grid w-full" data-ph-mask="">
                        {read.refs.map((ref) => (
                            <li
                                key={ref.ref}
                                className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 border-t border-border/70 py-1.5 text-[13.5px]"
                            >
                                <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                                    {ref.ref}
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                    {joinFacts(
                                        count(ref.visits, "visit"),
                                        `${formatNumber(ref.paid)} paid`,
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {read.moreRefs > 0 ? (
                        <p
                            data-ph-mask=""
                            className="text-xs text-muted-foreground"
                        >
                            And {count(read.moreRefs, "more link")}.
                        </p>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
