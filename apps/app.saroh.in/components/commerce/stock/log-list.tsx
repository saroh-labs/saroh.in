"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { productHref } from "@/lib/products/links";
import type { LogKindId } from "@/lib/stock/log";
import {
    allStorefrontsWords,
    entryNote,
    entryQuantity,
    entryTime,
    entryTone,
    entryWho,
    groupByDay,
    LOG_KINDS,
    logCountWords,
    logKinds,
} from "@/lib/stock/log";
import { loadLogPage } from "@/lib/stock/screen-actions";
import type { StockLog, StockLogEntry } from "@/lib/stock/service";

import { chipClass, pillClass, TEXT_TONE } from "./tones";

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
 * time. Names only for a role that reads the audit trail, order links only
 * for one that reads orders; the API leaves them out otherwise.
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
    pageSize,
}: {
    log: StockLog | "failed";
    filter: { kind: LogKindId; store: string; product: string };
    storefronts: { id: string; name: string }[];
    products: { id: string; name: string }[];
    href: (change: Record<string, string | undefined>) => string;
    pageSize: number;
}) {
    const router = useRouter();
    const [loaded, setLoaded] = useState(() => ({
        from: log,
        entries: log === "failed" ? [] : log.entries,
        next: log === "failed" ? null : log.nextCursor,
    }));
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pending, start] = useTransition();
    if (loaded.from !== log) {
        setLoaded({
            from: log,
            entries: log === "failed" ? [] : log.entries,
            next: log === "failed" ? null : log.nextCursor,
        });
    }

    const filters = (
        <>
            <div
                role="group"
                aria-label="Kind of change"
                className="mb-2 flex flex-wrap items-center gap-2"
            >
                {LOG_KINDS.map((k) => (
                    <Link
                        key={k.id}
                        href={href({ kind: k.id === "all" ? undefined : k.id })}
                        scroll={false}
                        aria-current={filter.kind === k.id ? "true" : undefined}
                        className={chipClass(filter.kind === k.id)}
                    >
                        {k.label}
                    </Link>
                ))}
            </div>
            <div className="mb-3.5 flex flex-wrap items-center gap-2">
                {storefronts.length > 1 ? (
                    <div
                        role="group"
                        aria-label="Location"
                        className="flex flex-wrap gap-2"
                    >
                        {[
                            {
                                id: "all",
                                label: allStorefrontsWords(storefronts.length),
                            },
                            ...storefronts.map((s) => ({
                                id: s.id,
                                label: s.name,
                            })),
                        ].map((s) => (
                            <Link
                                key={s.id}
                                href={href({
                                    store: s.id === "all" ? undefined : s.id,
                                })}
                                scroll={false}
                                aria-current={
                                    filter.store === s.id ? "true" : undefined
                                }
                                className={chipClass(filter.store === s.id)}
                            >
                                {s.label}
                            </Link>
                        ))}
                    </div>
                ) : null}
                <OptionSelect
                    size="sm"
                    aria-label="Product"
                    className="h-[30px] w-auto min-w-[160px] max-w-[260px] rounded-[8px] text-[12.5px] coarse:h-11"
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
                {log !== "failed" ? (
                    <span className="ml-auto text-[12px] text-muted-foreground">
                        {logCountWords(loaded.entries.length, !!loaded.next)}
                    </span>
                ) : null}
            </div>
        </>
    );

    if (log === "failed") {
        return (
            <div>
                {filters}
                <FailedState
                    title="The stock log couldn't be loaded"
                    description="Nothing is lost — every change is still recorded. Saroh just couldn't read the log right now."
                    action={
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.refresh()}
                        >
                            Try again
                        </Button>
                    }
                />
            </div>
        );
    }

    const timezone = log.timezone ?? "Asia/Kolkata";
    const days = groupByDay(loaded.entries, timezone);
    const byId = new Map(loaded.entries.map((e) => [e.id, e]));
    const pairOf = (e: StockLogEntry) =>
        e.pairId
            ? (loaded.entries.find(
                  (o) => o.pairId === e.pairId && o.id !== e.id,
              ) ??
              byId.get(e.pairId) ??
              null)
            : null;

    const more = () =>
        start(async () => {
            if (!loaded.next) return;
            setLoadError(null);
            const res = await loadLogPage({
                kind: logKinds(filter.kind),
                storefront: filter.store === "all" ? undefined : filter.store,
                product: filter.product || undefined,
                cursor: loaded.next,
                limit: pageSize,
            });
            if (!res.ok) {
                setLoadError(res.error);
                return;
            }
            setLoaded((l) => ({
                ...l,
                entries: [...l.entries, ...res.data.entries],
                next: res.data.nextCursor,
            }));
        });

    // The design's columns; the two number columns grow for a business
    // that counts in thousands, and every row of a day shares them. Desk
    // only: a phone stacks each entry instead (`PHONE_*`).
    const grid =
        "min-[760px]:grid min-[760px]:min-w-[540px] min-[760px]:grid-cols-[42px_minmax(130px,1.4fr)_78px_minmax(34px,auto)_minmax(62px,auto)_minmax(120px,1fr)] min-[760px]:gap-x-2";

    return (
        <div>
            {filters}
            <div className="grid gap-4">
                {days.map((d) => (
                    <section
                        key={d.key}
                        aria-label={d.label}
                        className="min-w-0"
                    >
                        <h3 className="pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {d.label}
                        </h3>
                        <div className="rounded-xl border border-border bg-card min-[760px]:overflow-x-auto">
                            <ul className={cn(grid, "px-4")}>
                                {d.rows.map((e, i) => {
                                    const qty = entryQuantity(e.quantity);
                                    const who = entryWho(e);
                                    const note = entryNote(e, pairOf(e));
                                    return (
                                        <li
                                            key={e.id}
                                            className={cn(
                                                "col-span-full py-2.5 text-[13px] min-[760px]:grid min-[760px]:grid-cols-subgrid min-[760px]:items-baseline",
                                                PHONE_ENTRY,
                                                i > 0 &&
                                                    "border-t border-border",
                                            )}
                                        >
                                            <span className="text-[12px] tabular-nums text-muted-foreground max-[759px]:order-1 max-[759px]:shrink-0">
                                                {entryTime(
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
                                                    className="font-semibold text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground max-[759px]:relative max-[759px]:order-2 max-[759px]:min-w-0 max-[759px]:flex-1 max-[759px]:[overflow-wrap:anywhere] max-[759px]:before:absolute max-[759px]:before:-inset-y-3 max-[759px]:before:inset-x-0 max-[759px]:before:content-[''] min-[760px]:truncate"
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
                                                <span
                                                    className={pillClass(
                                                        entryTone(e),
                                                    )}
                                                >
                                                    {e.kind === "REVERSED"
                                                        ? "Undo"
                                                        : e.word}
                                                </span>
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
                                                    <Link
                                                        href={`/commerce/orders/${encodeURIComponent(e.order.id)}`}
                                                        className="text-brand transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground max-[759px]:relative max-[759px]:before:absolute max-[759px]:before:-inset-y-3 max-[759px]:before:inset-x-0 max-[759px]:before:content-['']"
                                                    >
                                                        {who}
                                                    </Link>
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
                        </div>
                    </section>
                ))}
                {days.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border-strong px-4 py-7 text-center text-[13px] text-muted-foreground">
                        {filter.kind === "all" &&
                        filter.store === "all" &&
                        !filter.product
                            ? "No stock changes yet. Counts, sales, deliveries and moves show here as they happen."
                            : "Nothing matches these filters."}
                    </div>
                ) : null}
            </div>
            {loaded.next ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={more}
                    >
                        {pending ? "Loading…" : "Show older"}
                    </Button>
                    {loadError ? (
                        <span
                            role="alert"
                            className="text-[12px] text-destructive"
                        >
                            {loadError}
                        </span>
                    ) : null}
                </div>
            ) : null}
            <p className="mt-3.5 max-w-[72ch] text-pretty text-[12px] leading-normal text-muted-foreground">
                Sold and Returned come from orders, so nobody can type them.
                Entries can&apos;t be deleted. A mistake is fixed with a new
                entry, so the log always adds up to what&apos;s on the shelf.
            </p>
        </div>
    );
}
