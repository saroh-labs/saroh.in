"use client";

import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import { Label } from "@saroh/ui/label";
import { OptionSelect } from "@saroh/ui/option-select";
import { TextLink } from "@saroh/ui/text-link";
import { showError, showUndo } from "@saroh/ui/toast";
import { CalendarDays, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { firstName } from "@/lib/names";
import type { LocalDate } from "@/lib/services/diary";
import { addDays } from "@/lib/services/diary";
import { addExtraHours, removeExtraHours } from "@/lib/staff/actions";
import { planRefusal, spanWords } from "@/lib/staff/day-plan";
import type { ExtraItem } from "@/lib/staff/hours-view";
import type { ExtraHours, StaffView } from "@/lib/staff/types";

import { ClockRow } from "./clock-select";
import { Face } from "./face";
import { PanelGroup } from "./hours-panel";

function toPicker(date: LocalDate): Date {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
}
function fromPicker(date: Date): LocalDate {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Sat 24 Oct · 2 to 5 pm". */
export function extraWhen(x: ExtraHours, today?: LocalDate): string {
    return `${formatDay(x.date.slice(0, 10), { weekday: "short", today })} · ${spanWords(x.startMinute, x.endMinute)}`;
}

/**
 * Extra opening hours (U17, BKMAvailability "extra opening hours"): the
 * one-off hours coming up — a closed day opened, for one day — each with
 * Close, which keeps the bookings in them and offers Undo; and "Add extra
 * hours", a day and its times, saved with Undo, so nobody is sent to the
 * calendar to add them. Opening closed time on the calendar still works,
 * and the panel says so.
 */
export function ExtraHoursBody({
    items,
    people,
    who,
    everyone,
    today,
    canEdit,
}: {
    items: ExtraItem[];
    /** Who extra hours can be added for. */
    people: StaffView[];
    /** The person shown, whose hours are added by default. */
    who: string | null;
    /** Everyone's hours are shown: each row says whose. */
    everyone: boolean;
    today: LocalDate;
    canEdit: boolean;
}) {
    const id = useId();
    const router = useRouter();
    const [gone, setGone] = useState<string[]>([]);
    const [adding, setAdding] = useState(false);
    const [staffId, setStaffId] = useState(who ?? people.at(0)?.id ?? "");
    const [date, setDate] = useState<LocalDate>(addDays(today, 1));
    const [from, setFrom] = useState(10 * 60);
    const [to, setTo] = useState(14 * 60);
    const [pick, setPick] = useState<"from" | "to" | null>(null);
    const [busy, setBusy] = useState(false);
    const [tried, setTried] = useState(false);
    const shown = items.filter((i) => !gone.includes(i.x.id));
    const problem = planRefusal({
        open: true,
        opens: from,
        closes: to,
        lunch: null,
        shifts: [],
    });

    async function close(item: ExtraItem) {
        setGone((g) => [...g, item.x.id]);
        const res = await runAction(() =>
            removeExtraHours(item.staffId, item.x.id),
        );
        if (!res) {
            setGone((g) => g.filter((x) => x !== item.x.id));
            return;
        }
        if (!res.ok) {
            setGone((g) => g.filter((x) => x !== item.x.id));
            showError(
                "Couldn't close the extra hours. Nothing has changed.",
                res.error,
            );
            return;
        }
        router.refresh();
        const day = formatDay(item.x.date.slice(0, 10), {
            weekday: "short",
            today,
        });
        showUndo(
            item.booked
                ? `Extra hours on ${day} closed. The ${count(item.booked, "booking stays", "bookings stay")}.`
                : `Extra hours on ${day} closed.`,
            async () => {
                const back = await addExtraHours(item.staffId, {
                    date: item.x.date.slice(0, 10),
                    startMinute: item.x.startMinute,
                    endMinute: item.x.endMinute,
                });
                if (!back.ok) return back;
                setGone((g) => g.filter((x) => x !== item.x.id));
                router.refresh();
                return { ok: true };
            },
        );
    }

    async function add() {
        setTried(true);
        if (problem || !staffId) return;
        const known = new Set(
            people.find((p) => p.id === staffId)?.extraHours.map((x) => x.id) ??
                [],
        );
        const res = await runAction(
            () =>
                addExtraHours(staffId, {
                    date,
                    startMinute: from,
                    endMinute: to,
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) {
            showError("Couldn't add the extra hours.", res.error);
            return;
        }
        const added = res.data.extraHours.find((x) => !known.has(x.id));
        setAdding(false);
        setTried(false);
        router.refresh();
        showUndo(
            `Extra hours added: ${formatDay(date, { weekday: "short", today })}, ${spanWords(from, to)}.`,
            async () => {
                if (!added) return { ok: true };
                const back = await removeExtraHours(staffId, added.id);
                if (!back.ok) return back;
                router.refresh();
                return { ok: true };
            },
        );
    }

    return (
        <div>
            {shown.length ? (
                <ul className="overflow-hidden rounded-[14px] border border-border bg-card">
                    {shown.map((item) => (
                        <li
                            key={item.x.id}
                            className="flex min-h-[60px] items-center gap-3 border-b border-border py-2 pl-3.5 pr-1 last:border-b-0"
                        >
                            <Face
                                icon={
                                    <CalendarDays
                                        aria-hidden
                                        className="size-[17px]"
                                    />
                                }
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[14.5px] font-semibold">
                                    {everyone
                                        ? `${firstName(item.who)} · `
                                        : ""}
                                    {extraWhen(item.x, today)}
                                </span>
                                <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                                    {item.booked === null
                                        ? "Bookings in it couldn't be checked"
                                        : item.booked
                                          ? `${count(item.booked, "booking in it stays", "bookings in it stay")} if you close these`
                                          : "Nothing booked in it yet"}
                                </span>
                            </span>
                            {canEdit ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-11 px-2.5"
                                    aria-label={`Close extra hours ${extraWhen(item.x, today)}`}
                                    onClick={() => void close(item)}
                                >
                                    Close
                                </Button>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-[14px] font-semibold">
                    No extra hours coming up
                </p>
            )}

            {canEdit && !adding ? (
                <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-12 w-full"
                    onClick={() => setAdding(true)}
                >
                    <Plus aria-hidden className="size-4" />
                    Add extra hours
                </Button>
            ) : null}

            {canEdit && adding ? (
                <div
                    role="group"
                    aria-label="Add extra hours"
                    className="mt-3 grid gap-3"
                >
                    {everyone ? (
                        <div className="grid gap-1.5">
                            <Label htmlFor={`${id}-who`}>Who</Label>
                            <OptionSelect
                                id={`${id}-who`}
                                value={staffId}
                                onValueChange={setStaffId}
                                options={people.map((p) => ({
                                    value: p.id,
                                    label: p.name,
                                }))}
                            />
                        </div>
                    ) : null}
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${id}-day`}>Day</Label>
                        <DatePicker
                            id={`${id}-day`}
                            value={toPicker(date)}
                            onValueChange={(d) => {
                                if (d) setDate(fromPicker(d));
                            }}
                            disabledDays={{ before: toPicker(today) }}
                            className="w-full"
                        />
                    </div>
                    <PanelGroup className="mt-0">
                        <ClockRow
                            label="From"
                            value={from}
                            open={pick === "from"}
                            onToggle={() =>
                                setPick(pick === "from" ? null : "from")
                            }
                            onPick={setFrom}
                        />
                        <ClockRow
                            label="To"
                            value={to}
                            upTo
                            open={pick === "to"}
                            onToggle={() =>
                                setPick(pick === "to" ? null : "to")
                            }
                            onPick={setTo}
                        />
                    </PanelGroup>
                    {tried && problem ? (
                        <p
                            role="alert"
                            className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                        >
                            {problem}
                        </p>
                    ) : null}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                                setAdding(false);
                                setTried(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            busy={busy}
                            busyLabel="Adding…"
                            onClick={() => void add()}
                        >
                            Add these hours
                        </Button>
                    </div>
                </div>
            ) : null}

            <p className="mt-2.5 text-[12.5px] leading-normal text-muted-foreground">
                You can also open closed time on the{" "}
                <TextLink href="/bookings">calendar</TextLink>.
            </p>
        </div>
    );
}
