"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";

import type { OrderFilterOptions } from "@/lib/orders/business-service";
import type {
    OrdersDate,
    OrdersFilters,
    OrdersPayment,
} from "@/lib/orders/list-filters";
import {
    DATE_OPTIONS,
    PAYMENT_OPTIONS,
    stepOptions,
} from "@/lib/orders/list-filters";
import type { OrdersQuery } from "@/lib/orders/list-query";
import type { FulfilmentType } from "@/lib/orders/read";
import { OptionSelect } from "@saroh/ui/option-select";

import {
    AttentionToggle,
    listFilterClass,
    NARROWED,
} from "@/components/shared/list-toolbar";
import { ProductFilter } from "./product-filter";

interface FilterProps {
    query: OrdersQuery;
    go: (patch: Partial<OrdersQuery>) => void;
}

/**
 * The Orders list's filters (plan B, B4), after the "Saroh Orders Screen"
 * design. Each change goes into the address (`list-filters.ts`), and the
 * server asks the API for the first page again.
 *
 * A list's toolbar holds its three most used filters, and the rest sit
 * behind one Filters button. For orders the three are the status
 * (`OrderStatusFilter`), the date (`OrderDateFilter`) and the location.
 * `OrderMoreFilters` is the rest: Step, How it's fulfilled, Payment,
 * Product and Late. At the desk they open in a popover; on a phone (B5,
 * DEC-067) every filter, the date included, sits in one sheet behind the
 * same button (`OrderFilters`), so a wall of menus never pushes the first
 * order below the fold.
 *
 * Step and Fulfilment offer only what the business's orders show (the
 * API's `options`). When those couldn't be read the two menus are left
 * out, rather than offered empty. What counts as Needs attention is the
 * API's: a sensitive entry only for a role that may read it.
 */
export function OrderFilters({
    query,
    options,
    go,
}: FilterProps & { options: OrderFilterOptions | null }) {
    return (
        <div role="group" aria-label="Filter orders" className="grid gap-2.5">
            <OrderDateFilter query={query} go={go} stacked />
            <OrderMoreFilters query={query} options={options} go={go} />
            <div className="flex flex-wrap gap-2">
                <OrderAttention query={query} go={go} />
            </div>
        </div>
    );
}

/** How many of `OrderMoreFilters`' filters are narrowed, for its button. */
export function moreFiltersOn(filters: OrdersFilters): number {
    return [
        !!filters.step,
        !!filters.fulfilment,
        !!filters.payment,
        !!filters.product,
        filters.late,
    ].filter(Boolean).length;
}

/**
 * Date, with a custom range. One of the toolbar's dropdowns at the desk,
 * as wide as its words; `stacked` in the phone's sheet, the sheet's width.
 */
export function OrderDateFilter({
    query,
    go,
    stacked = false,
}: FilterProps & { stacked?: boolean }) {
    const field = stacked ? "w-full min-w-0" : "w-auto min-w-0";
    return (
        <>
            <OptionSelect<OrdersDate | "">
                aria-label="Date"
                value={query.date ?? ""}
                onValueChange={(v) =>
                    go({ date: v || null, from: null, to: null })
                }
                options={[{ value: "", label: "All dates" }, ...DATE_OPTIONS]}
                className={
                    stacked
                        ? "w-full"
                        : cn(listFilterClass, query.date && NARROWED)
                }
            />
            {query.date === "custom" ? (
                <div
                    className={
                        stacked ? "grid grid-cols-2 gap-2.5" : "contents"
                    }
                >
                    <Input
                        type="date"
                        aria-label="From"
                        value={query.from ?? ""}
                        max={query.to ?? undefined}
                        onChange={(e) => go({ from: e.target.value || null })}
                        className={field}
                    />
                    <Input
                        type="date"
                        aria-label="To"
                        value={query.to ?? ""}
                        min={query.from ?? undefined}
                        onChange={(e) => go({ to: e.target.value || null })}
                        className={field}
                    />
                </div>
            ) : null}
        </>
    );
}

/**
 * Every filter past the three in the row: one to a line, each the width
 * of what holds it (the desk's popover, the phone's sheet).
 */
export function OrderMoreFilters({
    query,
    options,
    go,
}: FilterProps & { options: OrderFilterOptions | null }) {
    const steps = options ? stepOptions(options, query.fulfilment) : [];
    const stepKnown = steps.some((s) => s.key === query.step);

    function pickFulfilment(value: FulfilmentType | "") {
        const fulfilment = value || null;
        // A step the new way's orders never show would only empty the list.
        const keep =
            !query.step ||
            !options ||
            stepOptions(options, fulfilment).some((s) => s.key === query.step);
        go({ fulfilment, ...(keep ? {} : { step: null }) });
    }

    return (
        <>
            {options && steps.length > 0 ? (
                <OptionSelect<string>
                    aria-label="Step"
                    value={query.step ?? ""}
                    onValueChange={(v) => go({ step: v || null })}
                    options={[
                        { value: "", label: "All steps" },
                        ...steps.map((s) => ({ value: s.key, label: s.label })),
                        // A step from a shared link this business no longer
                        // shows: kept, so the menu says what the list is.
                        ...(query.step && !stepKnown
                            ? [{ value: query.step, label: "That step" }]
                            : []),
                    ]}
                    className={cn("w-full", query.step && NARROWED)}
                />
            ) : null}
            {options && options.types.length > 0 ? (
                <OptionSelect<FulfilmentType | "">
                    aria-label="How it's fulfilled"
                    value={query.fulfilment ?? ""}
                    onValueChange={pickFulfilment}
                    options={[
                        { value: "", label: "All ways" },
                        ...options.types.map((t) => ({
                            value: t.type,
                            label: t.label,
                        })),
                        ...(query.fulfilment &&
                        !options.types.some((t) => t.type === query.fulfilment)
                            ? [{ value: query.fulfilment, label: "That way" }]
                            : []),
                    ]}
                    className={cn("w-full", query.fulfilment && NARROWED)}
                />
            ) : null}
            <OptionSelect<OrdersPayment | "">
                aria-label="Payment"
                value={query.payment ?? ""}
                onValueChange={(v) => go({ payment: v || null })}
                options={[
                    { value: "", label: "All payments" },
                    ...PAYMENT_OPTIONS,
                ]}
                className={cn("w-full", query.payment && NARROWED)}
            />
            <ProductFilter
                value={query.product}
                name={
                    options?.product?.id === query.product
                        ? options.product.name
                        : null
                }
                onChange={(product) => go({ product })}
                className={cn("w-full max-w-none", query.product && NARROWED)}
            />
            {/* Late is one more dropdown: only what needs the merchant now
                is a chip, and a list has at most one. */}
            <OptionSelect<"" | "late">
                aria-label="Late"
                value={query.late ? "late" : ""}
                onValueChange={(v) => go({ late: v === "late" })}
                options={[
                    { value: "", label: "On time and late" },
                    { value: "late", label: "Late only" },
                ]}
                className={cn("w-full", query.late && NARROWED)}
            />
        </>
    );
}

/**
 * Needs attention (B15): the Orders list's one attention toggle, after the
 * dropdowns in the toolbar's row at the desk and in the Filters sheet on a
 * phone.
 */
export function OrderAttention({
    query,
    go,
    className,
}: FilterProps & { className?: string }) {
    return (
        <AttentionToggle
            label="Needs attention"
            on={query.attention}
            onToggle={() => go({ attention: !query.attention })}
            className={className}
        />
    );
}
