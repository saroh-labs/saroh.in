"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { productHref } from "@/lib/products/links";
import { CHECK_LABELS, checkWords, moreChecks } from "@/lib/stock/log";
import {
    loadChecksPage,
    resolveStockCheck,
    undoStock,
} from "@/lib/stock/screen-actions";
import type { StockCheck, StockChecks } from "@/lib/stock/service";

import { pillClass, SMALL_BUTTON } from "./tones";

const newKey = () => crypto.randomUUID();

/**
 * Stock checks (#521): what doesn't add up — a shelf short for its orders,
 * a count made against a number that had moved, a sale that took nothing
 * from the shelf, promised that isn't what open orders hold — each with
 * what can be done about it. Resolving records that someone looked; a
 * check opens again when its numbers move on.
 */
export function ChecksList({
    checks,
    pageSize,
}: {
    checks: StockChecks | "failed";
    pageSize: number;
}) {
    const router = useRouter();
    const [loaded, setLoaded] = useState(() => ({
        from: checks,
        list: checks === "failed" ? [] : checks.checks,
        next: checks === "failed" ? null : (checks.nextCursor ?? null),
    }));
    const [busy, setBusy] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pending, start] = useTransition();
    if (loaded.from !== checks) {
        setLoaded({
            from: checks,
            list: checks === "failed" ? [] : checks.checks,
            next: checks === "failed" ? null : (checks.nextCursor ?? null),
        });
    }

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
                    title="Stock checks couldn't be loaded"
                    description="Saroh couldn't compare the log with orders just now. This doesn't mean everything adds up."
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
    const canResolve = checks.canResolve;

    const resolve = async (c: StockCheck) => {
        setBusy(c.key);
        const res = await resolveStockCheck(c.key, {
            idempotencyKey: newKey(),
        });
        setBusy(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Marked as checked.");
        router.refresh();
    };

    const undoCount = async (c: StockCheck) => {
        if (!c.entryId) return;
        setBusy(c.key);
        const res = await undoStock({
            entryIds: [c.entryId],
            idempotencyKey: newKey(),
        });
        setBusy(null);
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

    const more = () =>
        start(async () => {
            if (!loaded.next) return;
            setLoadError(null);
            const res = await loadChecksPage({
                cursor: loaded.next,
                limit: pageSize,
            });
            if (!res.ok) {
                setLoadError(res.error);
                return;
            }
            setLoaded((l) => ({
                ...l,
                list: moreChecks(l.list, res.data),
                next: res.data.nextCursor ?? null,
            }));
        });

    return (
        <div>
            {intro}
            <div className="grid gap-2.5">
                {loaded.list.map((c) => {
                    const { label, tone } = CHECK_LABELS[c.kind];
                    const { title, body } = checkWords(c);
                    const off = busy === c.key;
                    return (
                        <article
                            key={c.key}
                            className="min-w-0 rounded-xl border border-border bg-card px-4 py-3.5"
                        >
                            <div className="flex flex-wrap items-baseline gap-2">
                                <span className={pillClass(tone)}>{label}</span>
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
                {loaded.list.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border-strong px-4 py-7 text-center text-[13px] text-muted-foreground">
                        Everything adds up. Every sale in the log matches an
                        order, and the last counts match the log.
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
                        {pending ? "Loading…" : "Show more"}
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
        <Button asChild variant="outline" className={SMALL_BUTTON}>
            <Link href={productHref(c.storeId, c.productId, "orders")}>
                See the orders
            </Link>
        </Button>
    );
    const checked = (primary: boolean) =>
        canResolve ? (
            <Button
                type="button"
                variant={primary ? "default" : "outline"}
                className={SMALL_BUTTON}
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
                        <Button asChild className={SMALL_BUTTON}>
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
                            type="button"
                            variant="outline"
                            className={SMALL_BUTTON}
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
                            asChild
                            variant="outline"
                            className={SMALL_BUTTON}
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
