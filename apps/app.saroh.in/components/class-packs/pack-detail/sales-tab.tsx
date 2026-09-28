"use client";

import { Button } from "@saroh/ui/button";
import { FailedState, PermissionDeniedState } from "@saroh/ui/data-state";
import Link from "next/link";

import type {
    MonthRow,
    PriceHistory,
    SaleRow,
} from "@/lib/class-packs/pack-sales";

const CARD =
    "min-w-0 rounded-[12px] border border-border bg-card px-[18px] py-4";
const H2 = "m-0 font-display text-[16px] font-semibold tracking-[-0.01em]";
const LINK =
    "rounded-[4px] font-semibold text-brand transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-foreground/70 coarse:inline-flex coarse:min-h-11 coarse:items-center";
const NAME_LINK =
    "rounded-[4px] font-semibold text-foreground transition-colors duration-fast hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-brand/80";

/**
 * Pack Detail's Sales (E17, after the design): sales and takings over six
 * months, the price history, and each sale with what it took, how the desk
 * recorded it being paid and who sold it. `pack:read` covers the amounts
 * (DEC-039); receipts link only for someone who may open invoices.
 *
 * `history` is null when the pack's events couldn't be read: the card says
 * so rather than claim the price never changed.
 */
export function SalesTab({
    sales,
    denied,
    months,
    monthsNote,
    history,
    allReceiptsHref,
    onRetry,
}: {
    /** Null when the sales couldn't be read. */
    sales: SaleRow[] | null;
    denied: boolean;
    months: MonthRow[];
    monthsNote: string;
    history: PriceHistory | null;
    /** The Invoices list narrowed to this pack; null without `invoice:read`. */
    allReceiptsHref: string | null;
    onRetry: () => void;
}) {
    if (denied) {
        return (
            <PermissionDeniedState
                title="You can't see this pack's sales"
                description="Your role doesn't reach what the pack has taken."
                note="An owner or admin can change what your role reaches in Team."
            />
        );
    }
    if (!sales) {
        return (
            <FailedState
                title="Sales could not be loaded"
                description="This tab couldn't read the pack's sales. Nothing has changed — every sale and receipt is as it was."
                action={
                    <Button variant="outline" onClick={onRetry}>
                        Try again
                    </Button>
                }
            />
        );
    }
    return (
        <div className="grid gap-3.5">
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
                <section aria-labelledby="pack-sales-months" className={CARD}>
                    <h2 id="pack-sales-months" className={`${H2} mb-1`}>
                        Sales and takings
                    </h2>
                    <div className="mb-2 text-[12.5px] text-muted-foreground">
                        {monthsNote}
                    </div>
                    {months.map((m) => (
                        <div
                            key={m.key}
                            className="grid grid-cols-[40px_minmax(0,1fr)_70px_70px] items-center gap-2.5 py-[5px] text-[12.5px]"
                        >
                            <span className="text-muted-foreground">
                                {m.label}
                            </span>
                            <div
                                aria-hidden
                                className="h-2 overflow-hidden rounded-full bg-muted"
                            >
                                <div
                                    className="h-full rounded-full bg-highlight"
                                    style={{ width: `${m.pct}%` }}
                                />
                            </div>
                            <span className="text-foreground/80">{m.n}</span>
                            <span className="text-right font-semibold tabular-nums">
                                {m.amt}
                            </span>
                        </div>
                    ))}
                </section>
                <section aria-labelledby="pack-price-history" className={CARD}>
                    <h2 id="pack-price-history" className={`${H2} mb-2`}>
                        Price history
                    </h2>
                    {history ? (
                        history.entries.map((x, i) => (
                            <div
                                key={`${x.t}-${i}`}
                                className="border-t border-border/70 py-2"
                            >
                                <div className="text-[14px] font-semibold tabular-nums">
                                    {x.t}
                                </div>
                                <div className="mt-0.5 text-[12px] text-muted-foreground">
                                    {x.sub}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p
                            role="alert"
                            className="m-0 border-t border-border/70 py-2 text-[13px] text-foreground/80"
                        >
                            The price changes couldn&apos;t be loaded. Try again
                            in a minute.
                        </p>
                    )}
                    {history?.note ? (
                        <div className="mt-1.5 text-[12px] text-muted-foreground">
                            {history.note}
                        </div>
                    ) : null}
                    <div className="mt-1.5 text-[12px] text-muted-foreground">
                        A price change only affects new sales.
                    </div>
                </section>
            </div>

            <section aria-labelledby="pack-each-sale" className={CARD}>
                <div className="mb-1 flex flex-wrap items-baseline gap-2.5">
                    <h2 id="pack-each-sale" className={`${H2} flex-1`}>
                        Each sale
                    </h2>
                    {allReceiptsHref ? (
                        <Link
                            href={allReceiptsHref}
                            className={`${LINK} text-[12.5px]`}
                        >
                            All its receipts
                        </Link>
                    ) : null}
                </div>
                <div className="mb-2 text-[12.5px] text-muted-foreground">
                    How it was paid is what the desk recorded.
                </div>
                {sales.length === 0 ? (
                    <p className="m-0 border-t border-border/70 py-2 text-[13px] text-muted-foreground">
                        Nobody has bought it yet.
                    </p>
                ) : (
                    <ul className="m-0 grid list-none p-0">
                        {sales.map((s) => (
                            <li
                                key={s.purchaseId}
                                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border/70 py-2 text-[13px]"
                            >
                                <span className="flex-[0_0_56px] text-muted-foreground">
                                    {s.when}
                                </span>
                                <span className="min-w-0 flex-[1_1_160px]">
                                    <Link
                                        href={s.href}
                                        aria-label={`Open ${s.name}`}
                                        className={NAME_LINK}
                                    >
                                        {s.name}
                                    </Link>
                                </span>
                                <span className="font-semibold tabular-nums">
                                    {s.amount}
                                    {s.older ? (
                                        <span className="font-normal text-muted-foreground">
                                            {" "}
                                            (older price)
                                        </span>
                                    ) : null}
                                </span>
                                <span className="text-foreground/80">
                                    {s.method}
                                </span>
                                {s.soldBy ? (
                                    <span className="text-muted-foreground">
                                        {s.soldBy}
                                    </span>
                                ) : null}
                                {s.receiptHref ? (
                                    <Link
                                        href={s.receiptHref}
                                        aria-label={`Receipt for ${s.name}, ${s.when}`}
                                        className={`${LINK} text-[12.5px]`}
                                    >
                                        Receipt
                                    </Link>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
