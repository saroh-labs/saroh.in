"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { X } from "lucide-react";
import { useId, useState } from "react";

import type { NewOff } from "@/lib/services/availability-rules";
import type { LocalDate } from "@/lib/services/diary";
import type { OffLine } from "@/lib/staff/time-off";
import { dayCount, offLineLabel, offLines } from "@/lib/staff/time-off";
import type { Closure, StaffView } from "@/lib/staff/types";

import { ADD_TIME_OFF_ID, AddTimeOffSheet } from "./add-time-off-sheet";

const card = "rounded-[12px] border border-border bg-card px-4 py-[13px]";
const cardTitle = "font-display text-[15px] font-semibold tracking-[-0.02em]";

/**
 * Availability's Time off card (E3, the Bookings design), read first: the
 * person's time off and the business's closures as one line each, and
 * "Add time off" by the heading, which opens the sheet with the fields
 * (`add-time-off-sheet.tsx`). Adds and removals are part of the screen's
 * draft until "Save changes"; a line added and not saved yet says so.
 */
export function TimeOffCard({
    me,
    closures,
    timezone,
    today,
    canEdit,
    offAdded,
    offRemoved,
    onAdd,
    onRemoveSaved,
    onRemoveNew,
}: {
    me: StaffView;
    closures: Closure[];
    timezone: string;
    today: LocalDate;
    canEdit: boolean;
    offAdded: NewOff[];
    offRemoved: string[];
    onAdd: (off: Omit<NewOff, "key">) => void;
    onRemoveSaved: (ids: string[]) => void;
    onRemoveNew: (key: string) => void;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    // Each opening is a fresh sheet: nothing typed last time comes back.
    const [opening, setOpening] = useState(0);

    const current = (line: OffLine) =>
        line.toDate >= today && !line.ids.some((x) => offRemoved.includes(x));
    const saved = [
        ...offLines(me.timeOff, timezone, false),
        ...offLines(closures, timezone, true),
    ]
        .filter(current)
        .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
    const pending = offAdded.filter(
        (o) => o.staffId === null || o.staffId === me.id,
    );

    return (
        <section aria-labelledby={`${id}-title`} className={card}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 id={`${id}-title`} className={cn(cardTitle, "flex-1")}>
                    Time off
                </h2>
                {canEdit ? (
                    <Button
                        id={ADD_TIME_OFF_ID}
                        variant="outline"
                        className="h-[30px] shrink-0 rounded-[8px] px-[11px] text-[12px] coarse:h-11"
                        onClick={() => {
                            setOpening((n) => n + 1);
                            setOpen(true);
                        }}
                    >
                        Add time off
                    </Button>
                ) : null}
            </div>
            <ul>
                {saved.map((line) => (
                    <OffRow
                        key={line.ids[0]}
                        when={offLineLabel(line)}
                        why={line.reason ?? "No reason given"}
                        canEdit={canEdit}
                        onRemove={() => onRemoveSaved(line.ids)}
                    />
                ))}
                {pending.map((o) => (
                    <OffRow
                        key={o.key}
                        when={offLineLabel({
                            fromDate: o.fromDate,
                            toDate: o.toDate,
                            days: dayCount(o.fromDate, o.toDate),
                            startMinute: o.startMinute,
                            endMinute: o.endMinute,
                            closed: o.staffId === null,
                        })}
                        why={`${o.reason === "" ? "No reason given" : o.reason} · not saved yet`}
                        canEdit={canEdit}
                        onRemove={() => onRemoveNew(o.key)}
                    />
                ))}
            </ul>
            {!saved.length && !pending.length ? (
                <p className="text-[12.5px] text-muted-foreground">
                    None booked.
                </p>
            ) : null}
            {canEdit ? (
                <AddTimeOffSheet
                    key={opening}
                    open={open}
                    onClose={() => setOpen(false)}
                    me={me}
                    today={today}
                    onAdd={onAdd}
                />
            ) : null}
        </section>
    );
}

export function OffRow({
    when,
    why,
    warn = false,
    canEdit,
    onRemove,
    removeLabel = "Remove this time off",
}: {
    when: string;
    why: string | null;
    warn?: boolean;
    canEdit: boolean;
    onRemove: () => void;
    removeLabel?: string;
}) {
    return (
        <li className="flex items-center gap-2 border-t border-border/60 py-[7px]">
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">{when}</div>
                {why ? (
                    <div
                        className={cn(
                            "text-[12px]",
                            warn
                                ? "text-brand-subtle-foreground"
                                : "text-muted-foreground",
                        )}
                    >
                        {why}
                    </div>
                ) : null}
            </div>
            {canEdit ? (
                <button
                    type="button"
                    aria-label={removeLabel}
                    onClick={onRemove}
                    className="grid size-8 place-items-center rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:size-11"
                >
                    <X aria-hidden className="size-4" />
                </button>
            ) : null}
        </li>
    );
}
