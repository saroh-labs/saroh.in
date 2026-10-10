"use client";

import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { useEffect, useId, useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import type { NewOff } from "@/lib/services/availability-rules";
import type { LocalDate } from "@/lib/services/diary";
import { previewOff } from "@/lib/staff/actions";
import { dayCount, offButtonLabel, offNote } from "@/lib/staff/time-off";
import type { StaffView } from "@/lib/staff/types";

import { ClockSelect } from "./clock-select";

/** The card's "Add time off": where the keyboard goes back to. */
export const ADD_TIME_OFF_ID = "availability-add-time-off";

/** "YYYY-MM-DD" as the picker's local Date, and back. */
function toPicker(date: LocalDate): Date {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
}
function fromPicker(date: Date): LocalDate {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Time off, added in a side sheet from the card's "Add time off": a range
 * of days, all day or part of the day, for this person or the whole
 * business. Before adding, it asks the API what bookings fall in that time
 * and says so; they are kept.
 *
 * Its button adds to the screen's draft and closes; nothing is written
 * until the page's "Save changes", and the sheet says so. A time that can't
 * be added keeps it open with what was chosen. Cancel, Escape and the close
 * button drop it, and the keyboard goes back to "Add time off". The card
 * gives each opening its own `key`, so a sheet starts fresh every time.
 */
export function AddTimeOffSheet({
    open,
    onClose,
    me,
    today,
    onAdd,
}: {
    open: boolean;
    onClose: () => void;
    me: StaffView;
    today: LocalDate;
    onAdd: (off: Omit<NewOff, "key">) => void;
}) {
    const id = useId();
    const [fromDate, setFromDate] = useState<LocalDate>(() =>
        new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
            .toISOString()
            .slice(0, 10),
    );
    const [toDateRaw, setToDate] = useState<LocalDate | null>(null);
    const [part, setPart] = useState<"day" | "hours">("day");
    const [startMinute, setStartMinute] = useState(13 * 60);
    const [endMinute, setEndMinute] = useState(17 * 60);
    const [who, setWho] = useState<"me" | "all">("me");
    const [why, setWhy] = useState("");
    const [taken, setTaken] = useState<number | null>(0);

    const lastDay = `${today.slice(0, 4)}-12-31`;
    const toDate = toDateRaw && toDateRaw >= fromDate ? toDateRaw : fromDate;
    const days = dayCount(fromDate, toDate);
    const closed = who === "all";
    const hours = part === "hours";
    const refusal =
        hours && endMinute <= startMinute
            ? "The end has to be after the start."
            : null;

    // What already falls in that time, asked of the API a moment after the
    // fields settle, and only while the sheet is open.
    useEffect(() => {
        if (!open || refusal) return;
        let live = true;
        const timer = setTimeout(() => {
            void previewOff({
                fromDate,
                toDate,
                ...(hours ? { startMinute, endMinute } : {}),
                ...(closed ? {} : { staffId: me.id }),
            }).then((res) => {
                if (live) setTaken(res.ok ? res.data.affected.length : null);
            });
        }, 250);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [
        open,
        refusal,
        fromDate,
        toDate,
        hours,
        startMinute,
        endMinute,
        closed,
        me.id,
    ]);

    const note = offNote({ refusal, taken, closed });

    function add() {
        if (refusal) return;
        onAdd({
            staffId: closed ? null : me.id,
            fromDate,
            toDate,
            startMinute: hours ? startMinute : null,
            endMinute: hours ? endMinute : null,
            reason: why.trim() || (closed ? "Closed" : ""),
        });
        onClose();
    }

    return (
        <Sheet
            open={open}
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
        >
            <SheetContent
                className="flex w-full flex-col sm:max-w-md"
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    document.getElementById(ADD_TIME_OFF_ID)?.focus();
                }}
            >
                <SheetHeader>
                    <SheetTitle>Add time off</SheetTitle>
                    <SheetDescription>
                        Days {me.name} can&apos;t be booked, or days the
                        business is closed. Bookings already made are kept.
                    </SheetDescription>
                </SheetHeader>
                <form
                    noValidate
                    className="mt-5 flex min-h-0 flex-1 flex-col"
                    onSubmit={(e) => {
                        e.preventDefault();
                        add();
                    }}
                >
                    {/* The fields scroll between the title and the
                        buttons; the padding keeps a focus ring at the
                        edge from being cut off. */}
                    <div className="-mx-1 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-1 pb-1">
                        <div className="flex flex-wrap gap-3">
                            <div className="grid min-w-[9.5rem] flex-1 gap-1.5">
                                <Label htmlFor={`${id}-from`}>From</Label>
                                <DatePicker
                                    id={`${id}-from`}
                                    value={toPicker(fromDate)}
                                    onValueChange={(d) => {
                                        if (d) setFromDate(fromPicker(d));
                                    }}
                                    disabledDays={{
                                        before: toPicker(today),
                                        after: toPicker(lastDay),
                                    }}
                                    className="w-full"
                                />
                            </div>
                            <div className="grid min-w-[9.5rem] flex-1 gap-1.5">
                                <Label htmlFor={`${id}-to`}>To</Label>
                                <DatePicker
                                    id={`${id}-to`}
                                    value={toPicker(toDate)}
                                    onValueChange={(d) => {
                                        if (d) setToDate(fromPicker(d));
                                    }}
                                    disabledDays={{
                                        before: toPicker(fromDate),
                                        after: toPicker(lastDay),
                                    }}
                                    className="w-full"
                                />
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor={`${id}-when`}>When</Label>
                            <OptionSelect
                                id={`${id}-when`}
                                value={part}
                                onValueChange={setPart}
                                options={[
                                    { value: "day", label: "All day" },
                                    {
                                        value: "hours",
                                        label: "Part of the day",
                                    },
                                ]}
                            />
                        </div>
                        {hours ? (
                            <div className="flex flex-wrap gap-3">
                                <div className="grid gap-1.5 text-[14px] font-medium">
                                    From
                                    <ClockSelect
                                        label="From time"
                                        value={startMinute}
                                        onChange={setStartMinute}
                                    />
                                </div>
                                <div className="grid gap-1.5 text-[14px] font-medium">
                                    Until
                                    <ClockSelect
                                        label="Until"
                                        value={endMinute}
                                        onChange={setEndMinute}
                                        upTo
                                    />
                                </div>
                            </div>
                        ) : null}
                        <div className="grid gap-1.5">
                            <Label htmlFor={`${id}-who`}>Who</Label>
                            <OptionSelect
                                id={`${id}-who`}
                                value={who}
                                onValueChange={setWho}
                                options={[
                                    { value: "me", label: `Just ${me.name}` },
                                    {
                                        value: "all",
                                        label: "Everyone, the business is closed",
                                    },
                                ]}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor={`${id}-why`}>
                                Reason{" "}
                                <span className="font-normal text-muted-foreground">
                                    (optional, only your team sees it)
                                </span>
                            </Label>
                            <Input
                                id={`${id}-why`}
                                value={why}
                                maxLength={200}
                                autoComplete="off"
                                onChange={(e) => setWhy(e.target.value)}
                            />
                        </div>
                        <p
                            role={note.tone === "danger" ? "alert" : undefined}
                            className={cn(
                                "text-pretty text-[12.5px]",
                                note.tone === "danger"
                                    ? "font-medium text-destructive-subtle-foreground"
                                    : note.tone === "warn"
                                      ? "text-brand-subtle-foreground"
                                      : "text-muted-foreground",
                            )}
                        >
                            {note.text}
                        </p>
                    </div>

                    <SheetFooter className="mt-4 flex-col items-stretch gap-3 border-t border-border pt-4 sm:flex-col sm:space-x-0">
                        <p className="text-pretty text-[12.5px] text-muted-foreground">
                            Adding it here isn&apos;t saving it. It joins this
                            screen&apos;s changes, marked &ldquo;not saved
                            yet&rdquo;, until you press Save changes.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="submit"
                                variant="brand"
                                disabled={refusal !== null}
                            >
                                {offButtonLabel({
                                    days,
                                    closed,
                                    partOfDay: hours,
                                })}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={onClose}
                            >
                                Cancel
                            </Button>
                        </div>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
