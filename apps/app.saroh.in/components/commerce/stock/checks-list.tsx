"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { rememberPageSize } from "@saroh/ui/page-sizes";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ListPaging } from "@/components/shared/lists/list-toolbar";
import { productHref } from "@/lib/products/links";
import type { StockHref, StockListPage } from "@/lib/stock/list-query";
import { STOCK_LISTS, STOCK_PAGES_LABEL } from "@/lib/stock/list-query";
import { CHECK_LABELS, checkWords } from "@/lib/stock/log";
import { resolveStockCheck, undoStock } from "@/lib/stock/screen-actions";
import type { StockCheck, StockChecks } from "@/lib/stock/service";
import { couldntLoad, nothingChanged } from "@saroh/ui/lib/state-copy";

import { StatusBadge } from "@/components/shared/lists/status-badge";
import { runAction } from "@/lib/api/run-action";
import { PILL_TONE } from "./tones";

const newKey = () => crypto.randomUUID();

/**
 * Stock checks (#521): what doesn't add up — a shelf short for its orders,
 * a count made against a number that had moved, a sale that took nothing
 * from the shelf, promised that isn't what open orders hold — each with
 * what can be done about it, a page at a time under the one list footer.
 * Resolving records that someone looked; a check opens again when its
 * numbers move on.
 */
export function ChecksList({
    checks,
    href,
    paging,
}: {
    checks: StockChecks | "failed";
    /** The screen's address with these changed. */
    href: StockHref;
    /** The page on screen and its rows per page. */
    paging: StockListPage;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);

    const intro = (
        <p className="mb-3.5 max-w-[72ch] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
            Saroh compares the log with orders and counts. Each check says what
            doesn&apos;t add up and what you can do about it.
        </p>
    );

    if (checks === "failed") {
        return (
            <div>
                {intro}
                <FailedState
                    size="panel"
                    title={couldntLoad("stock checks")}
                    description={nothingChanged(
                        "This doesn't mean everything adds up.",
                    )}
                    onRetry={() => router.refresh()}
                />
            </div>
        );
    }
    const canResolve = checks.canResolve;

    const resolve = async (c: StockCheck) => {
        const res = await runAction(
            () =>
                resolveStockCheck(c.key, {
                    idempotencyKey: newKey(),
                }),
            { setBusy: (on) => setBusy(on ? c.key : null) },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Marked as checked.");
        router.refresh();
    };

    const undoCount = async (c: StockCheck) => {
        const entryId = c.entryId;
        if (!entryId) return;
        const res = await runAction(
            () =>
                undoStock({
                    entryIds: [entryId],
                    idempotencyKey: newKey(),
                }),
            { setBusy: (on) => setBusy(on ? c.key : null) },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            "Count undone.",
            `${c.storeName} is back to what the log said. Count it again when you can.`,
        );
        router.refresh();
    };

    return (
        <div>
            {intro}
            <div className="grid gap-2.5">
                {checks.checks.map((c) => {
                    const { label, tone } = CHECK_LABELS[c.kind];
                    const { title, body } = checkWords(c);
                    const off = busy === c.key;
                    return (
                        <article
                            key={c.key}
                            className="min-w-0 rounded-xl border border-border bg-card px-4 py-3.5"
                        >
                            <div className="flex flex-wrap items-baseline gap-2">
                                <StatusBadge tone={PILL_TONE[tone]}>
                                    {label}
                                </StatusBadge>
                                <h3 className="flex-[1_1_260px] text-pretty text-[14px] font-semibold">
                                    {title}
                                </h3>
                            </div>
                            <p className="mt-1.5 text-pretty text-[13px] leading-[1.55] text-foreground/80">
                                {body}
                            </p>
                            <div className="mt-2.5 flex flex-wrap gap-2">
                                <CheckActions
                                    check={c}
                                    canResolve={canResolve}
                                    off={off}
                                    onResolve={() => void resolve(c)}
                                    onUndoCount={() => void undoCount(c)}
                                />
                            </div>
                        </article>
                    );
                })}
                {checks.checks.length === 0 ? (
                    <EmptyState
                        size="panel"
                        title="Everything adds up"
                        description="Every sale in the log matches an order, and the last counts match the log."
                    />
                ) : null}
            </div>
            <ListPaging
                label={STOCK_PAGES_LABEL.checks}
                page={paging.page}
                total={checks.total ?? checks.checks.length}
                size={paging.size}
                to={(n) => ({ href: href({ page: n }) })}
                onSize={(size) => {
                    rememberPageSize(STOCK_LISTS.checks, size);
                    router.push(href({ size }), { scroll: false });
                }}
            />
        </div>
    );
}

/** What each kind of check offers, by who may change stock. */
function CheckActions({
    check: c,
    canResolve,
    off,
    onResolve,
    onUndoCount,
}: {
    check: StockCheck;
    canResolve: boolean;
    off: boolean;
    onResolve: () => void;
    onUndoCount: () => void;
}) {
    const orders = (
        <Button size="sm" asChild variant="outline">
            <Link href={productHref(c.storeId, c.productId, "orders")}>
                See the orders
            </Link>
        </Button>
    );
    const checked = (primary: boolean) =>
        canResolve ? (
            <Button
                size="sm"
                type="button"
                variant={primary ? "default" : "outline"}
                disabled={off}
                onClick={onResolve}
            >
                Mark as checked
            </Button>
        ) : null;
    switch (c.kind) {
        case "SHORT":
            return (
                <>
                    {orders}
                    {canResolve ? (
                        <Button size="sm" asChild>
                            <Link
                                href={productHref(
                                    c.storeId,
                                    c.productId,
                                    "variants",
                                )}
                            >
                                Change stock
                            </Link>
                        </Button>
                    ) : null}
                </>
            );
        case "COUNT_MISMATCH":
            return (
                <>
                    {checked(true)}
                    {canResolve && c.entryId ? (
                        <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            disabled={off}
                            onClick={onUndoCount}
                        >
                            Undo the count
                        </Button>
                    ) : null}
                </>
            );
        case "SALE_NOT_TAKEN":
            return (
                <>
                    {checked(true)}
                    {c.order ? (
                        <Button
                            data-ph-unmask=""
                            size="sm"
                            asChild
                            variant="outline"
                        >
                            <Link
                                href={`/commerce/orders/${encodeURIComponent(c.order.id)}`}
                            >
                                {`Open order #${c.order.number}`}
                            </Link>
                        </Button>
                    ) : null}
                </>
            );
        case "PROMISED_MISMATCH":
            return (
                <>
                    {checked(true)}
                    {orders}
                </>
            );
    }
}
