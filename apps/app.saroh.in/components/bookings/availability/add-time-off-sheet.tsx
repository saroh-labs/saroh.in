"use client";

import { Chip } from "@saroh/ui/chip";
import { DatePicker } from "@saroh/ui/date-picker";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Notice } from "@saroh/ui/notice";
import { OptionSelect } from "@saroh/ui/option-select";
import { Segmented } from "@saroh/ui/segmented";
import { TextLink } from "@saroh/ui/text-link";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { calendarHref } from "@/lib/services/calendar-href";
import type { LocalDate } from "@/lib/services/diary";
import { addDays } from "@/lib/services/diary";
import {
    addClosure,
    addTimeOff,
    previewOff,
    removeClosures,
    removeTimeOffMany,
} from "@/lib/staff/actions";
import { planRefusal } from "@/lib/staff/day-plan";
import type { QuickWhen } from "@/lib/staff/time-off";
import {
    clashWords,
    offAdded,
    offSpan,
    quickDates,
} from "@/lib/staff/time-off";
import type { Closure, StaffView } from "@/lib/staff/types";

import { ClockRow } from "./clock-select";
import { PanelGroup, PanelLabel } from "./hours-panel";
import { OffKind } from "./off-kind";

/** "Add time off" under the list: where the keyboard goes back to. */
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
 * Add time off (U17, BKMHoursV2TimeOff): someone is away, or — for those
 * who may — the business is closed; who; Today, Tomorrow or dates of your
 * own, with no end to the year (BA-03); all day or some hours; a reason
 * only the team sees; and, asked of the API as the fields settle, how many
 * bookings fall in that time. They stay booked, and "See them" opens them
 * on the calendar. Its button saves at once (DEC-170: nothing waits for a
 * page Save), and the toast's Undo takes it back off. A problem keeps the
 * sheet open with what was chosen.
 */
export function AddTimeOffSheet({
    open,
    onClose,
    people,
    who: startWho,
    today,
    business,
    canClose,
    closures,
}: {
    open: boolean;
    onClose: () => void;
    /** Everyone who takes bookings, to choose who is away. */
    people: StaffView[];
    /** Who it opens on: the person whose hours are shown. */
    who: string;
    today: LocalDate;
    /** The business's name, for "Nobody at Kaya Physio can be booked." */
    business: string;
    /** May close the whole business (`service:write`). */
    canClose: boolean;
    closures: Closure[];
}) {
    const id = useId();
    const router = useRouter();
    const [kind, setKind] = useState<"person" | "business">("person");
    const [staffId, setStaffId] = useState(
        people.some((p) => p.id === startWho)
            ? startWho
            : (people[0]?.id ?? ""),
    );
    const [when, setWhen] = useState<QuickWhen>("tomorrow");
    const [fromDate, setFromDate] = useState<LocalDate>(addDays(today, 1));
    const [toRaw, setToDate] = useState<LocalDate>(addDays(today, 1));
    const [some, setSome] = useState(false);
    const [from, setFrom] = useState(13 * 60);
    const [to, setTo] = useState(15 * 60);
    const [pick, setPick] = useState<"from" | "to" | null>(null);
    const [why, setWhy] = useState("");
    const [taken, setTaken] = useState<number | null>(0);
    const [pending, setPending] = useState(false);
    const [tried, setTried] = useState(false);

    const closed = kind === "business";
    const toDate = toRaw >= fromDate ? toRaw : fromDate;
    const problem = some
        ? planRefusal({
              open: true,
              opens: from,
              closes: to,
              lunch: null,
              shifts: [],
          })
        : null;
    const person = people.find((p) => p.id === staffId);

    // What already falls in that time, asked a moment after the fields
    // settle, and only while the sheet is open.
    useEffect(() => {
        if (!open || problem) return;
        let live = true;
        const timer = setTimeout(() => {
            void previewOff({
                fromDate,
                toDate,
                ...(some ? { startMinute: from, endMinute: to } : {}),
                ...(closed ? {} : { staffId }),
            }).then((res) => {
                if (live) setTaken(res.ok ? res.data.affected.length : null);
            });
        }, 250);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [open, problem, fromDate, toDate, some, from, to, closed, staffId]);

    function quick(w: QuickWhen) {
        setWhen(w);
        if (w === "pick") return;
        const d = quickDates(w, today);
        setFromDate(d.from);
        setToDate(d.to);
    }

    async function add() {
        setTried(true);
        if (problem || (!closed && !person)) return;
        const range = {
            fromDate,
            toDate,
            ...(some ? { startMinute: from, endMinute: to } : {}),
            reason: why.trim() || undefined,
        };
        const known = new Set([
            ...closures.map((c) => c.id),
            ...(person?.timeOff.map((t) => t.id) ?? []),
        ]);
        const res = await runAction(
            async (): Promise<
                | { ok: true; rows: { id: string }[]; affected: number }
                | { ok: false; error: string }
            > => {
                if (closed) {
                    const r = await addClosure({
                        ...range,
                        reason: why.trim() || "Closed",
                    });
                    return r.ok
                        ? {
                              ok: true,
                              rows: r.data.closures,
                              affected: r.data.affected.length,
                          }
                        : r;
                }
                const r = await addTimeOff(staffId, range);
                return r.ok
                    ? {
                          ok: true,
                          rows: r.data.staff.timeOff,
                          affected: r.data.affected.length,
                      }
                    : r;
            },
            { setBusy: setPending },
        );
        if (!res) return;
        if (!res.ok) {
            showError("Couldn't add the time off.", res.error);
            return;
        }
        const added = res.rows.map((r) => r.id).filter((x) => !known.has(x));
        onClose();
        router.refresh();
        showUndo(offAdded(res.affected), async () => {
            if (!added.length) return { ok: true };
            const back = closed
                ? await removeClosures(added)
                : await removeTimeOffMany(staffId, added);
            if (!back.ok) return back;
            router.refresh();
            return { ok: true };
        });
    }

    const seeThem = calendarHref("agenda", fromDate, {
        person: closed ? null : staffId,
    });

    return (
        <FormSheet
            open={open}
            bottomOnPhone
            returnFocusTo={ADD_TIME_OFF_ID}
            title="Add time off"
            description="Bookings already made are kept."
            pending={pending}
            saveLabel="Add time off"
            savingLabel="Adding…"
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                void add();
            }}
        >
            {canClose ? <OffKind value={kind} onChange={setKind} /> : null}

            {!closed ? (
                <div className="grid gap-1.5">
                    <PanelLabel className="mb-0 mt-3">
                        <Label
                            htmlFor={`${id}-who`}
                            className="text-[13px] font-semibold"
                        >
                            Who
                        </Label>
                    </PanelLabel>
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

            <PanelLabel id={`${id}-when`} className="mb-0 mt-3">
                When
            </PanelLabel>
            <div
                role="radiogroup"
                aria-labelledby={`${id}-when`}
                className="flex gap-1.5"
            >
                {(
                    [
                        ["today", "Today"],
                        ["tomorrow", "Tomorrow"],
                        ["pick", "Pick dates"],
                    ] as const
                ).map(([w, label]) => (
                    <Chip
                        key={w}
                        on={when === w}
                        onClick={() => quick(w)}
                        className="h-11 flex-1 justify-center px-2"
                    >
                        {label}
                    </Chip>
                ))}
            </div>
            <div className="flex flex-wrap gap-3">
                <div className="grid min-w-[9.5rem] flex-1 gap-1.5">
                    <Label htmlFor={`${id}-from`}>From</Label>
                    <DatePicker
                        id={`${id}-from`}
                        value={toPicker(fromDate)}
                        onValueChange={(d) => {
                            if (!d) return;
                            setWhen("pick");
                            setFromDate(fromPicker(d));
                        }}
                        // No end to the year: 30 Dec to 2 Jan is one stretch (BA-03).
                        disabledDays={{ before: toPicker(today) }}
                        className="w-full"
                    />
                </div>
                <div className="grid min-w-[9.5rem] flex-1 gap-1.5">
                    <Label htmlFor={`${id}-to`}>To</Label>
                    <DatePicker
                        id={`${id}-to`}
                        value={toPicker(toDate)}
                        onValueChange={(d) => {
                            if (!d) return;
                            setWhen("pick");
                            setToDate(fromPicker(d));
                        }}
                        disabledDays={{ before: toPicker(fromDate) }}
                        className="w-full"
                    />
                </div>
            </div>
            <p className="text-[12.5px] text-muted-foreground">
                {offSpan(fromDate, toDate, closed ? business : null)}
            </p>

            <Segmented
                label="All day or some hours"
                block
                size="md"
                className="mt-1"
                value={some ? "some" : "all"}
                onValueChange={(v) => {
                    setPick(null);
                    setSome(v === "some");
                }}
                options={[
                    { value: "all", label: "All day" },
                    { value: "some", label: "Some hours" },
                ]}
            />
            {some ? (
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
                        onToggle={() => setPick(pick === "to" ? null : "to")}
                        onPick={setTo}
                    />
                </PanelGroup>
            ) : null}
            {tried && problem ? (
                <p
                    role="alert"
                    className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    {problem}
                </p>
            ) : null}

            <div className="mt-2 grid gap-1.5">
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
                    placeholder={
                        closed ? "e.g. Diwali" : "e.g. Leave, a course"
                    }
                    onChange={(e) => setWhy(e.target.value)}
                />
            </div>

            {problem ? null : taken === null ? (
                <p className="text-[12.5px] text-muted-foreground">
                    Bookings then couldn&apos;t be checked.
                </p>
            ) : taken > 0 ? (
                <Notice tone="warning" className="mt-1">
                    {clashWords(taken)} They stay booked.{" "}
                    <TextLink
                        href={seeThem}
                        className="font-semibold text-inherit"
                    >
                        See them
                    </TextLink>
                </Notice>
            ) : (
                <p className="text-[12.5px] text-muted-foreground">
                    There are no bookings then.
                </p>
            )}
        </FormSheet>
    );
}
