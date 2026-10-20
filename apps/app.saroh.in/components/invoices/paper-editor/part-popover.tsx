"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { MoneyInput } from "@saroh/ui/money-input";
import { Trash2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";

import { HeaderOverlay } from "@/components/bookings/calendar/header/header-overlay";
import { GstRatePicker } from "@/components/shared/gst-rate-picker";
import type { InvoiceFormValues } from "@/lib/invoices/new-invoice";

import type { PaperTarget } from "../new-invoice/paper-preview";

/** Two targets are the same part. */
export function samePart(a: PaperTarget | null, b: PaperTarget): boolean {
    if (a?.part !== b.part) return false;
    return a.part !== "line" || (b.part === "line" && a.index === b.index);
}

/** The id a part's control carries, for focus to come back to. */
export function partId(target: PaperTarget): string {
    return target.part === "line"
        ? `paper-part-line-${target.index}`
        : `paper-part-${target.part}`;
}

/**
 * One part of the paper, pressable (U15 #1127): the part as drawn, and over
 * it the control that opens its editor, a popover beside it on the desk
 * and a sheet from the foot of a phone (`HeaderOverlay`). The control is
 * laid over the part rather than around it, so the paper's own words stay
 * as they are for a screen reader and the press has a name of its own.
 */
export function PartOverlay({
    target,
    label,
    title,
    open,
    onOpenChange,
    footer,
    editor,
    children,
}: {
    target: PaperTarget;
    /** The control's name: "Change line 2: Butter croissant". */
    label: string;
    /** The editor's title. */
    title: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    footer?: ReactNode;
    /** Drawn only while open. */
    editor: () => ReactNode;
    children: ReactNode;
}) {
    const trigger: ReactElement = (
        <button
            type="button"
            id={partId(target)}
            aria-label={label}
            data-part-control={target.part}
            className="absolute -inset-1 z-[1] cursor-pointer rounded-[6px] ring-1 ring-transparent transition-shadow duration-fast hover:ring-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:ring-2 data-[state=open]:ring-foreground"
        />
    );
    return (
        <div className="relative">
            {children}
            <HeaderOverlay
                open={open}
                onOpenChange={onOpenChange}
                trigger={trigger}
                title={title}
                width={380}
                footer={footer}
            >
                {open ? editor() : null}
            </HeaderOverlay>
        </div>
    );
}

/**
 * A line, changed on the paper (INVNewEdit's "Line 2"): what it's for,
 * Qty, Price each and on a registered business its HSN and GST rate. It
 * writes the form's own fields, so the paper, the totals and the autosave
 * follow every keystroke; a wrong value is said under it, as on the form.
 */
export function LineEditor({
    form,
    index,
    currency,
    registered,
}: {
    form: UseFormReturn<InvoiceFormValues>;
    index: number;
    currency: string;
    registered: boolean;
}) {
    const id = useId();
    const err = form.formState.errors.lines?.[index];
    const rate = useWatch({
        control: form.control,
        name: `lines.${index}.gstRate`,
    });
    const problem =
        err?.description?.message ??
        err?.quantity?.message ??
        err?.unitPrice?.message ??
        err?.gstRate?.message ??
        err?.hsnSac?.message;
    return (
        <div className="grid gap-3">
            <div className="grid gap-1.5">
                <Label htmlFor={`${id}-what`} className="text-[12.5px]">
                    What it&apos;s for
                </Label>
                <Input
                    id={`${id}-what`}
                    autoFocus
                    aria-invalid={Boolean(err?.description)}
                    {...form.register(`lines.${index}.description`)}
                />
            </div>
            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="grid content-start gap-1.5">
                    <Label htmlFor={`${id}-qty`} className="text-[12.5px]">
                        Qty
                    </Label>
                    <Input
                        id={`${id}-qty`}
                        inputMode="numeric"
                        className="tabular-nums"
                        aria-invalid={Boolean(err?.quantity)}
                        {...form.register(`lines.${index}.quantity`, {
                            valueAsNumber: true,
                        })}
                    />
                </div>
                <div className="grid content-start gap-1.5">
                    <Label htmlFor={`${id}-price`} className="text-[12.5px]">
                        Price each
                    </Label>
                    <Controller
                        control={form.control}
                        name={`lines.${index}.unitPrice`}
                        render={({ field }) => (
                            <MoneyInput
                                {...field}
                                id={`${id}-price`}
                                currency={currency}
                                onValueChange={field.onChange}
                                aria-invalid={Boolean(err?.unitPrice)}
                            />
                        )}
                    />
                </div>
                {registered ? (
                    <div className="col-span-2 grid content-start gap-1.5 sm:col-span-1">
                        <Label htmlFor={`${id}-hsn`} className="text-[12.5px]">
                            HSN / SAC
                        </Label>
                        <Input
                            id={`${id}-hsn`}
                            inputMode="numeric"
                            className="font-mono"
                            aria-invalid={Boolean(err?.hsnSac)}
                            {...form.register(`lines.${index}.hsnSac`)}
                        />
                    </div>
                ) : null}
            </div>
            {registered ? (
                <div className="grid gap-1.5">
                    <span
                        id={`${id}-gst`}
                        className="text-[12.5px] font-medium"
                    >
                        GST
                    </span>
                    <GstRatePicker
                        labelledBy={`${id}-gst`}
                        value={rate}
                        invalid={Boolean(err?.gstRate)}
                        // The line's problem is said once, under the line.
                        errorId={err?.gstRate ? `${id}-problem` : undefined}
                        onChange={(v) =>
                            form.setValue(`lines.${index}.gstRate`, v, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                    />
                </div>
            ) : null}
            {problem ? (
                <p
                    id={`${id}-problem`}
                    role="alert"
                    className="text-[12px] text-destructive-subtle-foreground"
                >
                    {problem}
                </p>
            ) : null}
        </div>
    );
}

/** A line's foot: Remove line, then Done. */
export function LineFoot({
    onRemove,
    onDone,
}: {
    onRemove: () => void;
    onDone: () => void;
}) {
    return (
        <>
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
                <Trash2 aria-hidden className="size-3.5" />
                Remove line
            </Button>
            <span className="flex-1" aria-hidden />
            <Button type="button" size="sm" onClick={onDone}>
                Done
            </Button>
        </>
    );
}

/** Done, alone: the editors that change as they are used. */
export function DoneFoot({ onDone }: { onDone: () => void }) {
    return (
        <>
            <span className="flex-1" aria-hidden />
            <Button type="button" size="sm" onClick={onDone}>
                Done
            </Button>
        </>
    );
}

/**
 * A part that is the business's or the series', said rather than edited
 * here (the seller, the number): where it comes from, and that a tax
 * invoice always carries it.
 */
export function FromElsewhere({ children }: { children: ReactNode }) {
    return (
        <div className="grid gap-2 text-[13px] leading-[1.5]">{children}</div>
    );
}
