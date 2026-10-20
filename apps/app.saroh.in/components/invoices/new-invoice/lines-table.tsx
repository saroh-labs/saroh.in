"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { MoneyInput } from "@saroh/ui/money-input";
import { OptionSelect } from "@saroh/ui/option-select";
import { X } from "lucide-react";
import { useId } from "react";
import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";

import type { GstPriceMode } from "@/lib/gst/price-mode";
import type { GstRateValue } from "@/lib/invoices/gst";
import { GST_RATE_OPTIONS } from "@/lib/invoices/gst";
import type { InvoiceFormValues } from "@/lib/invoices/new-invoice";
import type { PickRow } from "@/lib/invoices/new-invoice-lines";
import { lineOfProduct } from "@/lib/invoices/new-invoice-lines";

import { placeLine, takeLine } from "./line-ops";
import { ProductPick } from "./product-pick";

/**
 * The rates as a line's narrow box shows them: "0%" with what it means as
 * the option's second line, so the box reads in its column.
 */
const LINE_RATES = GST_RATE_OPTIONS.map((o) =>
    o.value === "0"
        ? { value: o.value, label: "0%", hint: "Nil-rated or exempt" }
        : { value: o.value, label: o.label },
);

/**
 * The desk's one row a line (INVNewA): what it's for, Qty, Price each,
 * then GST and HSN on a registered business, then remove. A phone stacks
 * it (T7).
 */
const DESK_ROW = "sm:grid-cols-[minmax(0,1fr)_60px_104px_30px]";
const DESK_ROW_GST = "sm:grid-cols-[minmax(0,1fr)_56px_100px_104px_96px_30px]";

/**
 * What it's for (INVNewA): the lines, each with its description, quantity,
 * price, and on a GST-registered business its rate and HSN or SAC; "+ Add a
 * line" and "+ Pick from your products", which fills a line with the
 * product's price, rate and HSN.
 */
export function LinesTable({
    form,
    lines,
    currency,
    registered,
    canPickProducts,
    priceMode,
    disabled,
}: {
    form: UseFormReturn<InvoiceFormValues>;
    lines: UseFieldArrayReturn<InvoiceFormValues, "lines">;
    currency: string;
    registered: boolean;
    /** The business has products this person can read. */
    canPickProducts: boolean;
    /** How the business's prices carry GST, for a product picked. */
    priceMode: GstPriceMode | null;
    disabled: boolean;
}) {
    const ids = { lines: useId(), heading: useId() };
    const { errors } = form.formState;
    const { fields, append } = lines;
    const desk = registered ? DESK_ROW_GST : DESK_ROW;
    // A product fills the empty line it was picked under, else a new one.
    const onPick = (row: PickRow) =>
        void placeLine(
            form,
            lines,
            lineOfProduct(row, { registered, priceMode }),
        );
    const removeLine = (i: number) => takeLine(form, lines, i);

    return (
        <section
            aria-labelledby={ids.heading}
            className="rounded-[12px] border border-border bg-card px-4 py-[13px]"
        >
            <h2 id={ids.heading} className="label mb-2">
                What it&apos;s for
            </h2>
            {/* The desk's column heads (UX-080): a phone labels each field
                instead. The fields carry their own names for a screen
                reader. */}
            <div
                aria-hidden
                className={cn(
                    "hidden gap-1.5 px-0.5 pb-1 text-[11.5px] text-muted-foreground sm:grid",
                    desk,
                )}
            >
                <span>Item</span>
                <span>Qty</span>
                <span>Price each</span>
                {registered ? (
                    <>
                        <span>GST</span>
                        <span>HSN</span>
                    </>
                ) : null}
            </div>
            <ul className="grid gap-2 sm:gap-1.5">
                {fields.map((line, i) => {
                    const lineErr = errors.lines?.[i];
                    return (
                        <li
                            key={line.id}
                            className="grid gap-1.5 border-b border-border pb-2 last:border-b-0 sm:border-b-0 sm:pb-0"
                        >
                            {/* A phone stacks the line (T7): what it's for
                                beside its remove button, then Quantity and
                                Price each, labelled, side by side, then GST
                                and HSN. The desk keeps one row. The remove
                                button is drawn twice (one per layout, the
                                other display:none) so the tab order follows
                                what is seen. */}
                            <div
                                className={cn(
                                    "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-1.5",
                                    desk,
                                )}
                            >
                                <Input
                                    aria-label={`Line ${i + 1}: what it's for`}
                                    placeholder="What it's for"
                                    className="col-span-2 sm:col-span-1"
                                    disabled={disabled}
                                    aria-invalid={Boolean(lineErr?.description)}
                                    {...form.register(`lines.${i}.description`)}
                                />
                                <RemoveLine
                                    index={i}
                                    className="grid size-11 sm:hidden"
                                    disabled={disabled}
                                    onRemove={() => removeLine(i)}
                                />
                                <div className="grid gap-1 sm:contents">
                                    <Label
                                        htmlFor={`${ids.lines}-${i}-qty`}
                                        className="text-[12px] text-muted-foreground sm:hidden"
                                    >
                                        Quantity
                                    </Label>
                                    <Input
                                        id={`${ids.lines}-${i}-qty`}
                                        aria-label={`Line ${i + 1}: quantity`}
                                        inputMode="numeric"
                                        className="tabular-nums"
                                        disabled={disabled}
                                        aria-invalid={Boolean(
                                            lineErr?.quantity,
                                        )}
                                        {...form.register(
                                            `lines.${i}.quantity`,
                                            {
                                                valueAsNumber: true,
                                            },
                                        )}
                                    />
                                </div>
                                <div className="grid gap-1 sm:contents">
                                    <Label
                                        htmlFor={`${ids.lines}-${i}-price`}
                                        className="text-[12px] text-muted-foreground sm:hidden"
                                    >
                                        Price each
                                    </Label>
                                    <Controller
                                        control={form.control}
                                        name={`lines.${i}.unitPrice`}
                                        render={({ field }) => (
                                            <MoneyInput
                                                {...field}
                                                id={`${ids.lines}-${i}-price`}
                                                aria-label={`Line ${i + 1}: price each, ${currency}`}
                                                currency={currency}
                                                onValueChange={field.onChange}
                                                disabled={disabled}
                                                aria-invalid={Boolean(
                                                    lineErr?.unitPrice,
                                                )}
                                            />
                                        )}
                                    />
                                </div>
                                {registered ? (
                                    <>
                                        <div className="col-start-1 grid gap-1 sm:contents">
                                            <Label
                                                htmlFor={`${ids.lines}-${i}-gst`}
                                                className="text-[12px] text-muted-foreground sm:hidden"
                                            >
                                                GST rate
                                            </Label>
                                            <Controller
                                                control={form.control}
                                                name={`lines.${i}.gstRate`}
                                                render={({ field }) => (
                                                    <OptionSelect
                                                        id={`${ids.lines}-${i}-gst`}
                                                        aria-label={`Line ${i + 1}: GST rate`}
                                                        value={
                                                            field.value as GstRateValue
                                                        }
                                                        onValueChange={
                                                            field.onChange
                                                        }
                                                        options={LINE_RATES}
                                                        placeholder="GST rate"
                                                        disabled={disabled}
                                                        aria-invalid={
                                                            lineErr?.gstRate
                                                                ? true
                                                                : undefined
                                                        }
                                                    />
                                                )}
                                            />
                                        </div>
                                        <div className="grid gap-1 sm:contents">
                                            <Label
                                                htmlFor={`${ids.lines}-${i}-hsn`}
                                                className="text-[12px] text-muted-foreground sm:hidden"
                                            >
                                                HSN / SAC
                                            </Label>
                                            <Input
                                                id={`${ids.lines}-${i}-hsn`}
                                                aria-label={`Line ${i + 1}: HSN or SAC`}
                                                placeholder="HSN / SAC"
                                                inputMode="numeric"
                                                className="font-mono"
                                                disabled={disabled}
                                                aria-invalid={Boolean(
                                                    lineErr?.hsnSac,
                                                )}
                                                {...form.register(
                                                    `lines.${i}.hsnSac`,
                                                )}
                                            />
                                        </div>
                                    </>
                                ) : null}
                                <RemoveLine
                                    index={i}
                                    className="hidden sm:grid"
                                    disabled={disabled}
                                    onRemove={() => removeLine(i)}
                                />
                            </div>
                            {lineErr ? (
                                <p className="text-[12px] text-destructive-subtle-foreground">
                                    {lineErr.description?.message ??
                                        lineErr.quantity?.message ??
                                        lineErr.unitPrice?.message ??
                                        lineErr.gstRate?.message ??
                                        lineErr.hsnSac?.message}
                                </p>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
            <div className="mt-1.5 flex flex-wrap gap-x-4">
                <Button
                    variant="link"
                    size="inline"
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                        append({
                            description: "",
                            quantity: 1,
                            unitPrice: "",
                            gstRate: "",
                            hsnSac: "",
                        })
                    }
                    className="py-1.5 text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast hover:decoration-foreground active:text-muted-foreground max-sm:min-h-11"
                >
                    + Add a line
                </Button>
                {canPickProducts ? (
                    <ProductPick
                        currency={currency}
                        registered={registered}
                        disabled={disabled}
                        onPick={onPick}
                    />
                ) : null}
            </div>
            {registered ? (
                <p className="mt-1 text-[12px] text-muted-foreground">
                    Prices include GST. Each line needs its rate before the
                    invoice is issued: choose 0% for anything exempt or
                    nil-rated.
                </p>
            ) : null}
        </section>
    );
}

/** A line's remove button: 44px on a phone, the desk's 30px column. */
function RemoveLine({
    index,
    className,
    disabled,
    onRemove,
}: {
    index: number;
    className: string;
    disabled: boolean;
    onRemove: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={`Remove line ${index + 1}`}
            disabled={disabled}
            onClick={onRemove}
            className={cn(
                "place-items-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active",
                className,
            )}
        >
            <X aria-hidden className="size-4" />
        </button>
    );
}
