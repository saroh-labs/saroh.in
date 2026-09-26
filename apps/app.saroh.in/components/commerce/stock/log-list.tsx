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
 * The stock log (#521): every change to every shelf, newest first, grouped
 * by the business's day — by kind, storefront and product, a page at a
 * time. Names only for a role that reads the audit trail, order links only
 * for one that reads orders; the API leaves them out otherwise.
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
                        aria-label="Storefront"
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
    // that counts in thousands, and every row of a day shares them.
    const grid =
        "grid grid-cols-[42px_minmax(130px,1.4fr)_78px_minmax(34px,auto)_minmax(62px,auto)_minmax(120px,1fr)] gap-x-2";

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
                        <div className="overflow-x-auto rounded-xl border border-border bg-card">
                            <div className={cn(grid, "min-w-[540px] px-4")}>
                                {d.rows.map((e, i) => {
                                    const qty = entryQuantity(e.quantity);
                                    const who = entryWho(e);
                                    return (
                                        <div
                                            key={e.id}
                                            className={cn(
                                                "col-span-full grid grid-cols-subgrid items-baseline py-2.5 text-[13px]",
                                                i > 0 &&
                                                    "border-t border-border",
                                            )}
                                        >
                                            <span className="text-[12px] tabular-nums text-muted-foreground">
                                                {entryTime(
                                                    e.createdAt,
                                                    timezone,
                                                )}
                                            </span>
                                            <span className="grid min-w-0 gap-px">
                                                <Link
                                                    href={productHref(
                                                        e.storeId,
                                                        e.productId,
                                                        "variants",
                                                    )}
                                                    className="truncate font-semibold text-foreground hover:text-brand"
                                                >
                                                    {e.variantTitle
                                                        ? `${e.productName} ${e.variantTitle}`
                                                        : e.productName}
                                                </Link>
                                                <span className="text-[11.5px] text-muted-foreground">
                                                    {e.storeName}
                                                </span>
                                            </span>
                                            <span>
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
                                                    "text-right font-semibold tabular-nums",
                                                    TEXT_TONE[qty.tone],
                                                )}
                                            >
                                                {qty.text}
                                            </span>
                                            <span className="text-[12px] tabular-nums text-muted-foreground">
                                                {`${e.before} → ${e.after}`}
                                            </span>
                                            <span className="grid min-w-0 gap-px text-[12.5px]">
                                                {e.order ? (
                                                    <Link
                                                        href={`/commerce/orders/${encodeURIComponent(e.order.id)}`}
                                                        className="text-brand hover:text-foreground"
                                                    >
                                                        {who}
                                                    </Link>
                                                ) : who ? (
                                                    <span className="text-foreground/80">
                                                        {who}
                                                    </span>
                                                ) : null}
                                                <span className="text-pretty text-[11.5px] text-muted-foreground">
                                                    {entryNote(e, pairOf(e))}
                                                </span>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
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
