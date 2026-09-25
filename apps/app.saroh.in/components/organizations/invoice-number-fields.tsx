"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { cn } from "@saroh/ui/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import { ArrowDown, ArrowUp, Check, Lock } from "lucide-react";
import { useFormContext } from "react-hook-form";

import { OptionSelect } from "@/components/shared/option-select";
import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import type {
    NumberFormat,
    NumberPart,
    NumberRestart,
} from "@/lib/invoices/invoice-number";
import {
    decodeParts,
    encodeParts,
    formatNumber,
    longestNumber,
    MAX_COUNTER_DIGITS,
    MAX_NUMBER_LENGTH,
    MIN_COUNTER_DIGITS,
    moveRow,
    PART_LABEL,
    partValue,
    RESTART_LABEL,
} from "@/lib/invoices/invoice-number";

/** The four form values the editor writes. */
export interface NumberFieldValues {
    numberParts: string;
    numberSeparator: string;
    numberDigits: string;
    numberRestart: string;
}

const DIGIT_OPTIONS = Array.from(
    { length: MAX_COUNTER_DIGITS - MIN_COUNTER_DIGITS + 1 },
    (_, i) => {
        const n = String(MIN_COUNTER_DIGITS + i);
        return { value: n, label: `${n} digits` };
    },
);

/**
 * The Tax card's "built from parts" editor for invoice numbers: the parts
 * in the business's order (each on or off, moved with the arrows), the
 * separator, the counter's digits and when it restarts — and, under them,
 * the next invoice's number as it will print, with its length against
 * GST's 16. Wrapped at the card's field widths by `at`.
 */
export function InvoiceNumberFields({
    format,
    prefix,
    registered,
    next,
    problem,
    at,
}: {
    /** The format the four fields describe now. */
    format: NumberFormat;
    prefix: string | null;
    registered: boolean;
    /** The next invoice's number in it. */
    next: string;
    /** Whether the format is refused (the message is on its field). */
    /** Why the format is refused, worked out from what is on screen; null when it is fine. */
    problem: string | null;
    at: (
        basis: string,
        grow?: boolean,
    ) => { className: string; style: React.CSSProperties };
}) {
    // The settings form, which holds these four values among its own.
    const { control } = useFormContext<NumberFieldValues>();
    const hasMonth = format.parts.includes("MONTH");
    const restarts: NumberRestart[] = registered
        ? ["FY", "MONTH"]
        : ["FY", "MONTH", "NEVER"];
    const longest = longestNumber(format, prefix);
    const credit = formatNumber(format, {
        prefix,
        counter: 1,
        credit: true,
    });

    return (
        <>
            <FormField
                control={control}
                name="numberParts"
                render={({ field }) => {
                    const rows = decodeParts(field.value);
                    const set = (list: typeof rows) =>
                        field.onChange(encodeParts(list));
                    const move = (part: NumberPart, i: number, by: -1 | 1) => {
                        set(moveRow(rows, i, by));
                        // Keep the keyboard on the part that moved: on the
                        // same arrow, or the other one once it reaches an end.
                        requestAnimationFrame(() => {
                            const button = (dir: "up" | "down") =>
                                document.getElementById(
                                    `number-part-${part}-${dir}`,
                                ) as HTMLButtonElement | null;
                            const same = button(by === -1 ? "up" : "down");
                            const other = button(by === -1 ? "down" : "up");
                            (same && !same.disabled ? same : other)?.focus();
                        });
                    };
                    return (
                        <FormItem {...at("100%")}>
                            <FormLabel id="number-parts-label">
                                Invoice number parts
                            </FormLabel>
                            <ol
                                aria-labelledby="number-parts-label"
                                className="overflow-hidden rounded-lg border border-border"
                            >
                                {rows.map((row, i) => (
                                    <li
                                        key={row.part}
                                        className="flex items-center gap-2.5 border-b border-border/70 px-2.5 py-1.5 coarse:min-h-11"
                                    >
                                        <Checkbox
                                            id={`number-part-${row.part}`}
                                            checked={row.on}
                                            onCheckedChange={(on) =>
                                                set(
                                                    rows.map((r) =>
                                                        r.part === row.part
                                                            ? {
                                                                  ...r,
                                                                  on:
                                                                      on ===
                                                                      true,
                                                              }
                                                            : r,
                                                    ),
                                                )
                                            }
                                        />
                                        <label
                                            htmlFor={`number-part-${row.part}`}
                                            className={cn(
                                                "min-w-0 flex-1 text-[13px] !font-normal",
                                                !row.on &&
                                                    "text-muted-foreground",
                                            )}
                                        >
                                            {PART_LABEL[row.part]}
                                            <span className="ml-2 font-mono text-[12px] text-muted-foreground">
                                                {partValue(row.part, prefix)}
                                            </span>
                                        </label>
                                        <Button
                                            id={`number-part-${row.part}-up`}
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                            aria-label={`Move ${PART_LABEL[row.part]} earlier`}
                                            disabled={i === 0}
                                            onClick={() =>
                                                move(row.part, i, -1)
                                            }
                                        >
                                            <ArrowUp className="size-4" />
                                        </Button>
                                        <Button
                                            id={`number-part-${row.part}-down`}
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                            aria-label={`Move ${PART_LABEL[row.part]} later`}
                                            disabled={i === rows.length - 1}
                                            onClick={() => move(row.part, i, 1)}
                                        >
                                            <ArrowDown className="size-4" />
                                        </Button>
                                    </li>
                                ))}
                                <li className="flex items-center gap-2.5 bg-muted/50 px-2.5 py-2 text-[13px] text-muted-foreground">
                                    <Lock
                                        aria-hidden
                                        className="size-4 shrink-0"
                                    />
                                    <span className="flex-1">
                                        Counter
                                        <span className="ml-2 font-mono text-[12px]">
                                            {"1".padStart(format.digits, "0")}
                                        </span>
                                    </span>
                                    <span className="text-[11.5px]">
                                        Always last
                                    </span>
                                </li>
                            </ol>
                            <FormMessage />
                        </FormItem>
                    );
                }}
            />
            <FormField
                control={control}
                name="numberSeparator"
                render={({ field }) => (
                    <FormItem {...at("140px", false)}>
                        <FormLabel>Separator</FormLabel>
                        <FormControl>
                            <ToggleGroup
                                type="single"
                                value={field.value}
                                onValueChange={(v) => {
                                    if (v) field.onChange(v);
                                }}
                                aria-label="Separator"
                                className={SEGMENTED}
                            >
                                {(["/", "-"] as const).map((s) => (
                                    <ToggleGroupItem
                                        key={s}
                                        value={s}
                                        aria-label={
                                            s === "/" ? "Slash" : "Hyphen"
                                        }
                                        className={cn(SEGMENT, "font-mono")}
                                    >
                                        {s}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name="numberDigits"
                render={({ field }) => (
                    <FormItem {...at("140px", false)}>
                        <FormLabel>Counter</FormLabel>
                        <FormControl>
                            <OptionSelect
                                value={field.value}
                                onValueChange={field.onChange}
                                options={DIGIT_OPTIONS}
                                className="w-full"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name="numberRestart"
                render={({ field }) => (
                    <FormItem {...at("100%")}>
                        <FormLabel>Numbers restart</FormLabel>
                        <FormControl>
                            <ToggleGroup
                                type="single"
                                value={field.value}
                                onValueChange={(v) => {
                                    if (v) field.onChange(v);
                                }}
                                aria-label="Numbers restart"
                                className={SEGMENTED}
                            >
                                {restarts.map((r) => (
                                    <ToggleGroupItem
                                        key={r}
                                        value={r}
                                        disabled={r === "MONTH" && !hasMonth}
                                        className={SEGMENT}
                                    >
                                        {r === "NEVER"
                                            ? "Never"
                                            : RESTART_LABEL[r]}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        </FormControl>
                        <FormDescription>
                            {!hasMonth
                                ? "Every month needs the month in the number."
                                : registered
                                  ? "GST expects numbers to start again at least every financial year."
                                  : "Never keeps one running count."}
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <div
                aria-live="polite"
                className="flex basis-full flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-2.5"
            >
                <span className="text-[12.5px] text-muted-foreground">
                    Next invoice
                </span>
                <span className="font-mono text-[14px] font-medium">
                    {next}
                </span>
                <span
                    className={cn(
                        "ml-auto flex items-center gap-1 text-[11.5px]",
                        problem ? "text-destructive" : "text-muted-foreground",
                    )}
                >
                    {problem ? null : (
                        <Check aria-hidden className="size-3.5" />
                    )}
                    {`${longest.length} of ${MAX_NUMBER_LENGTH} characters at most`}
                </span>
                {problem ? (
                    <span
                        role="alert"
                        className="basis-full text-[12px] text-destructive"
                    >
                        {problem}
                    </span>
                ) : null}
                <span className="basis-full text-[11.5px] text-muted-foreground">
                    Credit notes read like{" "}
                    <span className="font-mono">{credit}</span>
                </span>
            </div>
        </>
    );
}
