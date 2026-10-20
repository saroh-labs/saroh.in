"use client";

import { cn } from "@saroh/ui/lib/utils";
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

/** The main row's "Other rate" chip: opens the second row, never a rate. */
const OTHER = "other";
/** The main row's "Not set" chip (an optional field only). */
const NOT_SET = "none";

type MainValue = GstRateValue | typeof OTHER | typeof NOT_SET;

const rateChoice = (value: GstRateValue): Choice<GstRateValue> =>
    value === "0"
        ? {
              value,
              label: "0%",
              ariaLabel: "0%, nil-rated or exempt",
              tip: "Nil-rated or exempt",
          }
        : { value, label: `${value}%` };

const OTHER_CHOICES = OTHER_GST_RATE_CHOICES.map((o) => rateChoice(o.value));

function mainChoices(optional: boolean): Choice<MainValue>[] {
    return [
        ...(optional
            ? [{ value: NOT_SET, label: "Not set" } as Choice<MainValue>]
            : []),
        ...MAIN_GST_RATES.map((v) => rateChoice(v) as Choice<MainValue>),
        { value: OTHER, label: "Other rate" },
    ];
}

/** A rate that is behind "Other rate" (0.25%, 3%, 12%, 28%, …). */
const isOtherRate = (rate: GstRateValue) => rate !== "" && !isMainGstRate(rate);

/**
 * The GST rate, as buttons (DEC-176). The main row is GST's slabs since GST
 * 2.0, 0%, 5%, 18% and 40%, then "Other rate", which opens the rest in a
 * second row in place: 0.25%, 3%, 12%, 28% and any other rate the one list
 * (`GST_RATE_OPTIONS`) has. A field that may be left empty (`optional`)
 * starts with "Not set".
 *
 * A saved rate is read as the API sends it ("18.00", "28"); one from the
 * second row opens with that row shown and its chip chosen. Opening Other
 * changes nothing until a rate in it is pressed, and pressing a main rate
 * closes it again, so moving between the rows never loses the rate.
 *
 * Both rows are `ChipGroup`s: one tab stop each, the arrows move the
 * choice, 44px under a thumb, and they wrap on a phone.
 */
export function GstRatePicker({
    value,
    onChange,
    optional = false,
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
    const rate = rateOption(value ?? "");
    const [opened, setOpened] = useState(() => isOtherRate(rate));
    const open = opened || isOtherRate(rate);

    const message: ReactNode =
        error ?? (!optional && rate === "" ? GST_RATE_NEEDED : null);
    const shownError = invalid && message ? message : null;
    const errorRef = errorId ?? (shownError ? `${ownId}-error` : undefined);
    const describe =
        [describedBy, invalid ? errorRef : undefined]
            .filter(Boolean)
            .join(" ") || undefined;

    const mainValue: MainValue | null = open
        ? OTHER
        : rate === ""
          ? optional
              ? NOT_SET
              : null
          : rate;

    return (
        <div className={cn("min-w-0", className)}>
            <ChipGroup<MainValue>
                labelledBy={labelledBy}
                label={label}
                describedBy={describe}
                invalid={invalid}
                required={!optional}
                disabled={disabled}
                choices={mainChoices(optional)}
                value={mainValue}
                onChange={(next) => {
                    if (next === OTHER) {
                        setOpened(true);
                        return;
                    }
                    setOpened(false);
                    onChange(next === NOT_SET ? "" : next);
                }}
            />
            {open ? (
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
