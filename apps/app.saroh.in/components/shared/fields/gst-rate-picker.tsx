"use client";

import { chipClass } from "@saroh/ui/chip";
import type { FieldControlProps } from "@saroh/ui/field";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import type { GstRateValue } from "@/lib/invoices/gst";
import {
    GST_RATE_NEEDED,
    isMainGstRate,
    MAIN_GST_RATES,
    OTHER_GST_RATE_CHOICES,
    rateOption,
} from "@/lib/invoices/gst";

import type { Choice } from "./choice-group";
import { ChipGroup } from "./choice-group";

/** The main row's "Not set" chip (an optional field only). */
const NOT_SET = "none";

type MainValue = GstRateValue | typeof NOT_SET;

const rateChoice = (value: GstRateValue): Choice<GstRateValue> =>
    value === "0"
        ? {
              value,
              label: "0%",
              ariaLabel: "0%, nil-rated or exempt",
              tip: "Nil-rated or exempt",
              data: { "data-rate": value },
          }
        : { value, label: `${value}%`, data: { "data-rate": value } };

const OTHER_CHOICES = OTHER_GST_RATE_CHOICES.map((o) => rateChoice(o.value));

function mainChoices(optional: boolean): Choice<MainValue>[] {
    return [
        ...(optional
            ? [
                  {
                      value: NOT_SET,
                      label: "Not set",
                      data: { "data-rate": "" },
                  } as Choice<MainValue>,
              ]
            : []),
        ...MAIN_GST_RATES.map((v) => rateChoice(v) as Choice<MainValue>),
    ];
}

/** A rate that is behind "Other rate" (0.25%, 3%, 12%, 28%, …). */
const isOtherRate = (rate: GstRateValue) => rate !== "" && !isMainGstRate(rate);

/**
 * The wiring a `Field` hands its child, for the picker: its label names the
 * rates, its line under the field describes them, and its error is the one
 * said (the picker draws none of its own). Use it as the Field's function
 * child: `{(control) => <GstRatePicker {...pickerWiring(control)} … />}`.
 */
export function pickerWiring(control: FieldControlProps) {
    const invalid = control["aria-invalid"] === true;
    return {
        labelledBy: `${control.id}-label`,
        describedBy: control["aria-describedby"],
        invalid,
        errorId: invalid ? `${control.id}-note` : undefined,
    };
}

/**
 * The GST rate, as buttons (DEC-176). The main row is GST's slabs since GST
 * 2.0, 0%, 5%, 18% and 40%, then "Other rate", which opens the rest in a
 * second row in place: 0.25%, 1.5%, 3%, 12%, 28% and any other rate the one
 * list (`GST_RATE_OPTIONS`) has. A field that may be left empty (`optional`)
 * starts with "Not set".
 *
 * "Other rate" is a disclosure, never a rate: a button with `aria-expanded`
 * beside the main radio group, not in it. The chosen rate's own chip is the
 * one highlighted, in whichever row it sits, so the rate is always visible.
 * A saved rate is read as the API sends it ("18.00", "28"); one from the
 * second row opens with that row shown, and the row stays shown while its
 * rate is the chosen one. Opening Other changes nothing until a rate in it
 * is pressed, and pressing a main rate closes it again.
 *
 * Both rows are `ChipGroup`s: one tab stop each, the arrows move the
 * choice, 44px under a thumb, and they wrap on a phone.
 */
export function GstRatePicker({
    value,
    onChange,
    optional = false,
    required = !optional,
    disabled = false,
    labelledBy,
    label,
    describedBy,
    invalid = false,
    error,
    errorId,
    className,
}: {
    /** The saved or typed rate ("18", "18.00", "0.25"), or "" / null for none. */
    value: string | null | undefined;
    /** A rate from `GST_RATE_OPTIONS`, or "" when Not set is pressed. */
    onChange: (rate: GstRateValue) => void;
    /** The field may be left empty: offers "Not set". */
    optional?: boolean;
    /**
     * Said to a screen reader as needing an answer. By default a field
     * that isn't optional is; a helper with no "Not set" that is not a
     * question of its own (one rate for every row) says false.
     */
    required?: boolean;
    disabled?: boolean;
    /** The id of the visible label above the picker. */
    labelledBy?: string;
    /** The picker's name for a screen reader, when nothing visible names it. */
    label?: string;
    /** A hint under the field, read with the picker. */
    describedBy?: string;
    /** Say the field's problem: a red line under it, and read with it. */
    invalid?: boolean;
    /**
     * The problem, drawn under the picker while `invalid`. A required field
     * with no rate says `GST_RATE_NEEDED` on its own. Pass `errorId` instead
     * to point at a message the screen draws itself.
     */
    error?: ReactNode;
    errorId?: string;
    className?: string;
}) {
    const ownId = useId();
    const rowId = `${ownId}-other`;
    const rate = rateOption(value ?? "");
    const [opened, setOpened] = useState(() => isOtherRate(rate));
    // A rate from the second row keeps it shown: its chip is the answer.
    const open = opened || isOtherRate(rate);

    const message: ReactNode =
        error ?? (required && rate === "" ? GST_RATE_NEEDED : null);
    const shownError = invalid && message ? message : null;
    const errorRef = errorId ?? (shownError ? `${ownId}-error` : undefined);
    // A Field's note may be both the hint and the error: named once.
    const describe =
        [describedBy, invalid ? errorRef : undefined]
            .join(" ")
            .split(" ")
            .filter((id, at, all) => id !== "" && all.indexOf(id) === at)
            .join(" ") || undefined;

    const mainValue: MainValue | null =
        rate === ""
            ? optional
                ? NOT_SET
                : null
            : isOtherRate(rate)
              ? null
              : rate;

    return (
        <div data-slot="gst-rate-picker" className={cn("min-w-0", className)}>
            <div className="flex min-w-0 flex-wrap gap-1.5">
                <ChipGroup<MainValue>
                    labelledBy={labelledBy}
                    label={label}
                    describedBy={describe}
                    invalid={invalid}
                    required={required}
                    disabled={disabled}
                    choices={mainChoices(optional)}
                    value={mainValue}
                    onChange={(next) => {
                        setOpened(false);
                        onChange(next === NOT_SET ? "" : next);
                    }}
                />
                <button
                    type="button"
                    data-slot="gst-other-rate"
                    aria-expanded={open}
                    aria-controls={open ? rowId : undefined}
                    disabled={disabled}
                    onClick={() => {
                        // Closing it would hide the chosen rate: it stays open.
                        if (isOtherRate(rate)) return;
                        setOpened(!open);
                    }}
                    className={chipClass(
                        false,
                        cn("border-dashed", open && "bg-muted"),
                    )}
                >
                    Other rate
                    <ChevronDown
                        aria-hidden
                        className={cn(
                            "size-4 transition-transform duration-fast",
                            open && "rotate-180",
                        )}
                    />
                </button>
            </div>
            {open ? (
                <div id={rowId}>
                    <ChipGroup<GstRateValue>
                        label="Other GST rates"
                        describedBy={describe}
                        disabled={disabled}
                        className="mt-2"
                        choices={OTHER_CHOICES}
                        value={isOtherRate(rate) ? rate : null}
                        onChange={(next) => {
                            setOpened(true);
                            onChange(next);
                        }}
                    />
                </div>
            ) : null}
            {shownError && !errorId ? (
                <p
                    id={errorRef}
                    className="mt-1.5 text-[12.5px] leading-[1.5] text-destructive"
                >
                    {shownError}
                </p>
            ) : null}
        </div>
    );
}
