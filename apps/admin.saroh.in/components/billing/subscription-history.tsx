import { Badge } from "@saroh/ui/badge";
import { chipClass } from "@saroh/ui/chip";
import Link from "next/link";

import { refLabel } from "@/lib/billing-action-words";
import { istDateTime } from "@/lib/billing-words";
import type {
    BillingHistoryPage,
    BillingHistoryRow,
    HistoryShow,
} from "@/lib/subscription-sheet";
import {
    HISTORY_SHOW_LABEL,
    HISTORY_SHOWS,
    historyTag,
} from "@/lib/subscription-sheet";

import { EmptyPanel } from "../states/empty-panel";
import { FailedPanel } from "../states/failed-panel";
import { RazorpayId, RefList } from "./razorpay-id";

const TAG_TONE: Record<string, "info" | "neutral" | "success" | "warning"> = {
    Razorpay: "info",
    Invoice: "success",
    Email: "neutral",
    Staff: "warning",
    Saroh: "neutral",
};

/**
 * The subscription sheet's History tab (U15, R27): one timeline, newest
 * first, of what Razorpay sent, the invoices, Saroh's billing emails and
 * what staff and Saroh did. The chips are addresses, like every Billing
 * filter. A provider event adds "What Razorpay sent": its type and ids,
 * never its message.
 *
 * `history` undefined: the read failed; null: refused.
 */
export function SubscriptionHistory({
    history,
    show,
    href,
}: {
    history: BillingHistoryPage | null | undefined;
    show: HistoryShow;
    /** The address of a chip's page. */
    href: (show: HistoryShow, page?: number) => string;
}) {
    return (
        <div className="grid gap-4 text-sm">
            <div
                role="group"
                aria-label="Show"
                className="flex flex-wrap gap-2"
            >
                {HISTORY_SHOWS.map((s) => (
                    <Link
                        key={s}
                        href={href(s)}
                        scroll={false}
                        replace
                        aria-current={s === show ? "true" : undefined}
                        className={chipClass(s === show)}
                    >
                        {HISTORY_SHOW_LABEL[s]}
                    </Link>
                ))}
            </div>

            {history === undefined ? (
                <FailedPanel things="the history" />
            ) : history === null ? (
                <p className="text-muted-foreground">
                    Your access does not cover Saroh&apos;s billing history.
                </p>
            ) : history.items.length === 0 && history.page === 1 ? (
                show === "everything" ? (
                    <EmptyPanel
                        title="Nothing has happened yet"
                        description="Razorpay's events, invoices, billing emails and staff actions show here as they happen."
                    />
                ) : (
                    <EmptyPanel
                        kind="no-results"
                        things="history"
                        cause="filters"
                        clearHref={href("everything")}
                    />
                )
            ) : (
                <>
                    <ol className="grid">
                        {history.items.map((row) => (
                            <HistoryItem key={row.id} row={row} />
                        ))}
                    </ol>
                    {history.page > 1 || history.hasMore ? (
                        <nav
                            aria-label="History pages"
                            className="flex items-center justify-between gap-2"
                        >
                            {history.page > 1 ? (
                                <Link
                                    href={href(show, history.page - 1)}
                                    scroll={false}
                                    className="underline underline-offset-4"
                                >
                                    Newer
                                </Link>
                            ) : (
                                <span />
                            )}
                            {history.hasMore ? (
                                <Link
                                    href={href(show, history.page + 1)}
                                    scroll={false}
                                    className="underline underline-offset-4"
                                >
                                    Older
                                </Link>
                            ) : null}
                        </nav>
                    ) : null}
                </>
            )}
        </div>
    );
}

function HistoryItem({ row }: { row: BillingHistoryRow }) {
    const tag = historyTag(row);
    return (
        <li className="grid gap-1 border-b py-3 first:pt-0 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="font-medium">{row.title}</p>
                <Badge variant={TAG_TONE[tag] ?? "neutral"}>{tag}</Badge>
            </div>
            <p className="text-[12px] text-muted-foreground">
                <time dateTime={row.at}>{istDateTime(row.at)}</time>
            </p>
            {row.line ? (
                <p className="text-muted-foreground">{row.line}</p>
            ) : null}
            {row.kind === "provider" ? (
                <ProviderSent refs={row.refs} />
            ) : (
                <RefList
                    refs={withoutAction(row.refs)}
                    labelOf={(key) => refLabel(key)}
                />
            )}
        </li>
    );
}

/** "What Razorpay sent": the event's type and id, nothing of its message. */
function ProviderSent({ refs }: { refs: Record<string, string> }) {
    return (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <dt className="text-muted-foreground">What Razorpay sent</dt>
            <dd className="font-mono">{refs.type}</dd>
            {refs.event ? (
                <dd>
                    <RazorpayId id={refs.event} provider={refs.provider} />
                </dd>
            ) : null}
        </dl>
    );
}

/** The ledger's action key says nothing the title doesn't. */
function withoutAction(refs: Record<string, string>): Record<string, string> {
    const { action: _action, ...rest } = refs;
    return rest;
}
