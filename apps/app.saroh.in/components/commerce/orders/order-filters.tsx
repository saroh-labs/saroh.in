"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";

import { OptionSelect } from "@/components/shared/option-select";
import type { OrderFilterOptions } from "@/lib/orders/business-service";
import type { OrdersDate, OrdersPayment } from "@/lib/orders/list-filters";
import {
    DATE_OPTIONS,
    filtersActive,
    NO_FILTERS,
    PAYMENT_OPTIONS,
    stepOptions,
} from "@/lib/orders/list-filters";
import type { OrdersQuery } from "@/lib/orders/list-query";
import type { FulfilmentType } from "@/lib/orders/read";

import { ProductFilter } from "./product-filter";

const SELECT =
    "h-[34px] w-auto min-w-[128px] max-w-full rounded-[9px] px-2.5 text-[12.5px] coarse:h-11";
const DATE_FIELD =
    "h-[34px] w-auto rounded-[9px] px-2.5 text-[12.5px] coarse:h-11";

/**
 * The Orders list's filter bar (plan B, B4), after the "Saroh Orders
 * Screen" design: Date (with a custom range), Step, How it's fulfilled,
 * Payment, Product and the Late toggle, then Clear filters once any is on.
 * Each change goes into the address (`list-filters.ts`), and the server
 * asks the API for the first page again.
 *
 * Step and Fulfilment offer only what the business's orders show (the
 * API's `options`). When those couldn't be read the two menus are left
 * out, rather than offered empty. Needs attention joins Late with B15.
 */
export function OrderFilters({
    query,
    options,
    go,
}: {
    query: OrdersQuery;
    options: OrderFilterOptions | null;
    go: (patch: Partial<OrdersQuery>) => void;
}) {
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
        <div
            role="group"
            aria-label="Filter orders"
            className="flex flex-wrap items-center gap-2 pt-2.5"
        >
            <OptionSelect<OrdersDate | "">
                aria-label="Date"
                value={query.date ?? ""}
                onValueChange={(v) =>
                    go({ date: v || null, from: null, to: null })
                }
                options={[{ value: "", label: "Any date" }, ...DATE_OPTIONS]}
                className={SELECT}
            />
            {query.date === "custom" ? (
                <>
                    <Input
                        type="date"
                        aria-label="From"
                        value={query.from ?? ""}
                        max={query.to ?? undefined}
                        onChange={(e) => go({ from: e.target.value || null })}
                        className={DATE_FIELD}
                    />
                    <Input
                        type="date"
                        aria-label="To"
                        value={query.to ?? ""}
                        min={query.from ?? undefined}
                        onChange={(e) => go({ to: e.target.value || null })}
                        className={DATE_FIELD}
                    />
                </>
            ) : null}
            {options && steps.length > 0 ? (
                <OptionSelect<string>
                    aria-label="Step"
                    value={query.step ?? ""}
                    onValueChange={(v) => go({ step: v || null })}
                    options={[
                        { value: "", label: "Any step" },
                        ...steps.map((s) => ({ value: s.key, label: s.label })),
                        // A step from a shared link this business no longer
                        // shows: kept, so the menu says what the list is.
                        ...(query.step && !stepKnown
                            ? [{ value: query.step, label: "That step" }]
                            : []),
                    ]}
                    className={SELECT}
                />
            ) : null}
            {options && options.types.length > 0 ? (
                <OptionSelect<FulfilmentType | "">
                    aria-label="How it's fulfilled"
                    value={query.fulfilment ?? ""}
                    onValueChange={pickFulfilment}
                    options={[
                        { value: "", label: "Any fulfilment" },
                        ...options.types.map((t) => ({
                            value: t.type,
                            label: t.label,
                        })),
                        ...(query.fulfilment &&
                        !options.types.some((t) => t.type === query.fulfilment)
                            ? [{ value: query.fulfilment, label: "That way" }]
                            : []),
                    ]}
                    className={SELECT}
                />
            ) : null}
            <OptionSelect<OrdersPayment | "">
                aria-label="Payment"
                value={query.payment ?? ""}
                onValueChange={(v) => go({ payment: v || null })}
                options={[
                    { value: "", label: "Any payment" },
                    ...PAYMENT_OPTIONS,
                ]}
                className={SELECT}
            />
            <ProductFilter
                value={query.product}
                name={
                    options?.product?.id === query.product
                        ? options.product.name
                        : null
                }
                onChange={(product) => go({ product })}
            />
            <Toggle
                label="Late"
                on={query.late}
                onFlip={() => go({ late: !query.late })}
            />
            {filtersActive(query) ? (
                <button
                    type="button"
                    onClick={() => go({ ...NO_FILTERS })}
                    className="rounded-sm px-1 text-[12.5px] font-semibold text-brand underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                >
                    Clear filters
                </button>
            ) : null}
        </div>
    );
}

/** A filter that is on or off: the design's pill, said by `aria-pressed`. */
function Toggle({
    label,
    on,
    onFlip,
}: {
    label: string;
    on: boolean;
    onFlip: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onFlip}
            className={cn(
                "h-[34px] shrink-0 rounded-full border px-3 text-[12.5px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:h-11",
                on
                    ? "border-foreground bg-foreground font-semibold text-background"
                    : "border-border bg-card font-medium text-foreground/75 hover:bg-muted",
            )}
        >
            {label}
        </button>
    );
}
