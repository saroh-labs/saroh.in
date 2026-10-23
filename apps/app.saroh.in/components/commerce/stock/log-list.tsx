"use client";

import { formatTime } from "@/lib/format/datetime";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { rememberPageSize } from "@saroh/ui/page-sizes";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { productHref } from "@/lib/products/links";
import type { StockHref, StockListPage } from "@/lib/stock/list-query";
import { STOCK_LISTS, STOCK_PAGES_LABEL } from "@/lib/stock/list-query";
import type { LogKindId } from "@/lib/stock/log";
import {
    allStorefrontsWords,
    entryNote,
    entryQuantity,
    entryTone,
    entryWho,
    groupByDay,
    LOG_KINDS,
    logCountWords,
} from "@/lib/stock/log";
import type { StockLog, StockLogEntry } from "@/lib/stock/service";
import { couldntLoad, nothingChanged } from "@saroh/ui/lib/state-copy";

import {
    ListFilter,
    ListPaging,
    listTable,
    ListTableHead,
    ListToolbar,
} from "@/components/shared/lists/list-toolbar";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { TextLink } from "@saroh/ui/text-link";
import { PILL_TONE, TEXT_TONE } from "./tones";

/**
 * A log entry on a phone: a wrapping row whose `order`s put the time, the
 * product and the change on line 1, then (after a full-width break) the
 * storefront, the kind, "15 → 14" and who or the note on line 2.
 */
const PHONE_ENTRY =
    "max-[759px]:flex max-[759px]:flex-wrap max-[759px]:items-baseline max-[759px]:gap-x-2 max-[759px]:gap-y-1";

/**
 * The stock log (#521): every change to every shelf, newest first, grouped
 * by the business's day — by kind, storefront and product, a page at a
 * time under the one list footer (rows per page, the page numbers,
 * Previous and Next). Names only for a role that reads the audit trail, order links only
 * for one that reads orders; the API leaves them out otherwise.
 *
 * It follows the one list toolbar and the one table look: the location
 * the product and the kind of change are dropdown filters in one row, and
 * the days are groups inside one card under one head band.
 *
 * On a phone (under 760px, T3) each entry is two wrapping lines, by CSS
 * alone (no hydration flash, nothing rendered twice): the time, the product
 * and its size, and the signed change; then the storefront, the kind, "15 →
 * 14" and the note or who. Nothing scrolls sideways there. The two links
 * reach 44px by an invisible hit area, so the lines stay close together.
 */
export function LogList({
    log,
    filter,
    storefronts,
    products,
    href,
    paging,
}: {
    log: StockLog | "failed";
    filter: { kind: LogKindId; store: string; product: string };
    storefronts: { id: string; name: string }[];
    products: { id: string; name: string }[];
    /** The screen's address with these changed. */
    href: StockHref;
    /** The page on screen and its rows per page. */
    paging: StockListPage;
}) {
    const router = useRouter();

    // The one list toolbar, in one row: the kind of change, the location
    // and the product are its dropdown filters, and how many entries the
    // filters keep, across every page, is the count on the right.
    const filters = (
        <ListToolbar
            className="mb-3.5"
            filters={
                <>
                    <ListFilter<LogKindId>
                        label="Kind of change"
                        value={filter.kind}
                        onValueChange={(id) =>
                            router.push(
                                href({ kind: id === "all" ? undefined : id }),
                                { scroll: false },
                            )
                        }
                        options={LOG_KINDS.map((k) => ({
                            value: k.id,
                            label: k.id === "all" ? "All changes" : k.label,
                        }))}
                    />
                    {storefronts.length > 1 ? (
                        <ListFilter
                            holdsData
                            label="Location"
                            value={filter.store}
                            options={[
                                {
                                    value: "all",
                                    label: allStorefrontsWords(
                                        storefronts.length,
                                    ),
                                },
                                ...storefronts.map((s) => ({
                                    value: s.id,
                                    label: s.name,
                                })),
                            ]}
                            onValueChange={(v) =>
                                router.push(
                                    href({
                                        store: v === "all" ? undefined : v,
                                    }),
                                    { scroll: false },
                                )
                            }
                        />
                    ) : null}
                    <ListFilter
                        holdsData
                        label="Product"
                        className="max-w-[260px]"
                        value={filter.product}
                        options={[
                            { value: "", label: "All products" },
                            ...products.map((p) => ({
                                value: p.id,
                                label: p.name,
                            })),
                        ]}
                        onValueChange={(v) =>
                            router.push(href({ product: v || undefined }), {
                                scroll: false,
                            })
                        }
                    />
                </>
            }
            onClear={
                filter.kind !== "all" ||
                filter.store !== "all" ||
                filter.product
                    ? () =>
                          router.push(
                              href({
                                  kind: undefined,
                                  store: undefined,
                                  product: undefined,
                              }),
                              { scroll: false },
                          )
                    : undefined
            }
            count={
                log !== "failed"
                    ? logCountWords(log.total ?? log.entries.length)
                    : null
            }
        />
    );

    if (log === "failed") {
        return (
            <div>
                {filters}
                <FailedState
                    size="panel"
                    title={couldntLoad("the stock log")}
                    description={nothingChanged(
                        "Every change is still recorded.",
                    )}
                    onRetry={() => router.refresh()}
                />
            </div>
        );
    }

    const timezone = log.timezone ?? "Asia/Kolkata";
    const days = groupByDay(log.entries, timezone);
    const byId = new Map(log.entries.map((e) => [e.id, e]));
    const pairOf = (e: StockLogEntry) =>
        e.pairId
            ? (log.entries.find(
                  (o) => o.pairId === e.pairId && o.id !== e.id,
              ) ??
              byId.get(e.pairId) ??
              null)
            : null;

    // The design's columns; the two number columns grow for a business
    // that counts in thousands, and every row of a day shares them. Desk
    // only: a phone stacks each entry instead (`PHONE_*`).
    // The time's column fits "12:30 pm" on one line at its 12px type: at
    // 42px, the 12-hour clock broke it in two ("2:40" over "pm").
    const grid =
        "min-[760px]:grid min-[760px]:min-w-[580px] min-[760px]:grid-cols-[62px_minmax(130px,1.4fr)_78px_minmax(34px,auto)_minmax(62px,auto)_minmax(120px,1fr)] min-[760px]:gap-x-2";
    // A part of that grid that spans it and hands its columns on.
    const span = "col-span-full min-[760px]:grid min-[760px]:grid-cols-subgrid";

    return (
        <div>
            {filters}
            <div className="grid gap-4">
                {days.length > 0 ? (
                    // One card for the whole log, in the one table look:
                    // the head band, each day a group inside it, and rows
                    // ruled edge to edge on one set of columns.
                    <div
                        data-list-table=""
                        className={cn(
                            listTable.frame,
                            "min-[760px]:overflow-x-auto",
                        )}
                    >
                        <div className={grid}>
                            <ListTableHead
                                className={cn(
                                    span,
                                    "rounded-t-[10px] max-[759px]:hidden",
                                )}
                            >
                                <span>Time</span>
                                <span>Product</span>
                                <span>Kind</span>
                                <span className="text-right">Change</span>
                                <span>On hand</span>
                                <span>Note</span>
                            </ListTableHead>
                            {days.map((d) => (
                                <section
                                    key={d.key}
                                    aria-label={d.label}
                                    // A rule between one day and the next:
                                    // a day's last entry draws none.
                                    className={cn(
                                        span,
                                        "min-w-0 border-t border-border first-of-type:border-t-0",
                                    )}
                                >
                                    <h3
                                        data-ph-unmask=""
                                        className={cn(
                                            listTable.group,
                                            "col-span-full",
                                        )}
                                    >
                                        {d.label}
                                    </h3>
                                    <ul className={span}>
                                        {d.rows.map((e) => {
                                            const qty = entryQuantity(
                                                e.quantity,
                                            );
                                            const who = entryWho(e);
                                            const note = entryNote(
                                                e,
                                                pairOf(e),
                                            );
                                            return (
                                                <li
                                                    key={e.id}
                                                    className={cn(
                                                        span,
                                                        listTable.rowStill,
                                                        "text-[13px] min-[760px]:items-baseline",
                                                        PHONE_ENTRY,
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            listTable.time,
                                                            "text-[12px] text-muted-foreground max-[759px]:order-1",
                                                        )}
                                                    >
                                                        {formatTime(
                                                            e.createdAt,
                                                            timezone,
                                                        )}
                                                    </span>
                                                    <span className="grid min-w-0 gap-px max-[759px]:contents">
                                                        <Link
                                                            href={productHref(
                                                                e.storeId,
                                                                e.productId,
                                                                "variants",
                                                            )}
                                                            className="font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground max-[759px]:relative max-[759px]:order-2 max-[759px]:min-w-0 max-[759px]:flex-1 max-[759px]:[overflow-wrap:anywhere] max-[759px]:before:absolute max-[759px]:before:-inset-y-3 max-[759px]:before:inset-x-0 max-[759px]:before:content-[''] min-[760px]:truncate"
                                                        >
                                                            {e.variantTitle
                                                                ? `${e.productName} ${e.variantTitle}`
                                                                : e.productName}
                                                        </Link>
                                                        <span
                                                            aria-hidden
                                                            className="hidden max-[759px]:order-4 max-[759px]:block max-[759px]:basis-full"
                                                        />
                                                        <span className="text-[11.5px] text-muted-foreground max-[759px]:order-5">
                                                            {e.storeName}
                                                        </span>
                                                    </span>
                                                    <span className="max-[759px]:order-6">
                                                        <StatusBadge
                                                            tone={
                                                                PILL_TONE[
                                                                    entryTone(e)
                                                                ]
                                                            }
                                                        >
                                                            {e.kind ===
                                                            "REVERSED"
                                                                ? "Undo"
                                                                : e.word}
                                                        </StatusBadge>
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            "text-right font-semibold tabular-nums max-[759px]:order-3 max-[759px]:shrink-0",
                                                            TEXT_TONE[qty.tone],
                                                        )}
                                                    >
                                                        {qty.text}
                                                    </span>
                                                    <span className="text-[12px] tabular-nums text-muted-foreground max-[759px]:order-7">
                                                        {`${e.before} → ${e.after}`}
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            "grid min-w-0 gap-px text-[12.5px] max-[759px]:order-8 max-[759px]:flex max-[759px]:flex-wrap max-[759px]:items-baseline max-[759px]:gap-x-2",
                                                            !who &&
                                                                !note &&
                                                                "max-[759px]:hidden",
                                                        )}
                                                    >
                                                        {e.order ? (
                                                            <TextLink
                                                                href={`/commerce/orders/${encodeURIComponent(e.order.id)}`}
                                                                className="max-[759px]:relative max-[759px]:before:absolute max-[759px]:before:-inset-y-3 max-[759px]:before:inset-x-0 max-[759px]:before:content-['']"
                                                            >
                                                                {who}
                                                            </TextLink>
                                                        ) : who ? (
                                                            <span className="text-foreground/80">
                                                                {who}
                                                            </span>
                                                        ) : null}
                                                        <span className="text-pretty text-[11.5px] text-muted-foreground [overflow-wrap:anywhere]">
                                                            {note}
                                                        </span>
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    </div>
                ) : null}
                {days.length === 0 ? (
                    filter.kind === "all" &&
                    filter.store === "all" &&
                    !filter.product ? (
                        <EmptyState
                            size="panel"
                            title="No stock changes yet"
                            description="Counts, sales, deliveries and moves show here as they happen."
                        />
                    ) : (
                        <EmptyState
                            kind="no-results"
                            size="panel"
                            things="stock changes"
                            cause="filters"
                            title="No stock changes match these filters"
                            clearHref={href({
                                kind: undefined,
                                store: undefined,
                                product: undefined,
                            })}
                        />
                    )
                ) : null}
            </div>
            <ListPaging
                label={STOCK_PAGES_LABEL.log}
                page={paging.page}
                total={log.total ?? log.entries.length}
                size={paging.size}
                to={(n) => ({ href: href({ page: n }) })}
                onSize={(size) => {
                    rememberPageSize(STOCK_LISTS.log, size);
                    router.push(href({ size }), { scroll: false });
                }}
            />
            <p className="mt-3.5 max-w-[72ch] text-pretty text-[12px] leading-normal text-muted-foreground">
                Sold and Returned come from orders, so nobody can type them.
                Entries can&apos;t be deleted. A mistake is fixed with a new
                entry, so the log always adds up to what&apos;s on the shelf.
            </p>
        </div>
    );
}
