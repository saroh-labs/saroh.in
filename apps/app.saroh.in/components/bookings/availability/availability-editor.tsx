"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo, showWarning } from "@saroh/ui/toast";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import type {
    AvailabilityDraft,
    KeptBooking,
    SaveOp,
} from "@/lib/services/availability-rules";
import {
    draftFrom,
    ruleChoices,
    saveOps,
    weeklyHours,
} from "@/lib/services/availability-rules";
import type { LocalDate } from "@/lib/services/diary";
import {
    addDays,
    clock,
    dayLabel,
    localDateOf,
    localMinuteOf,
    zonedInstant,
} from "@/lib/services/diary";
import {
    addExtraHours,
    addTimeOff,
    removeExtraHours,
    removeTimeOff,
    replaceStaffHours,
    updateBookingRules,
} from "@/lib/staff/actions";
import type {
    BookingBrief,
    BookingRules,
    StaffView,
    TimeOff,
} from "@/lib/staff/types";

import { AddPersonDialog } from "./add-person-dialog";
import { WeeklyHours } from "./weekly-hours";

/** "Wed 16 Sep · all day", or "Wed 16 Sep · 17:00–21:00". */
export function timeOffWhen(t: TimeOff, timezone: string): string {
    const from = localDateOf(t.startAt, timezone);
    if (t.allDay) {
        const last = localDateOf(new Date(Date.parse(t.endAt) - 1), timezone);
        return last === from
            ? `${dayLabel(from)} · all day`
            : `${dayLabel(from)} – ${dayLabel(last)} · all day`;
    }
    return `${dayLabel(from)} · ${clock(localMinuteOf(t.startAt, timezone))}–${clock(localMinuteOf(t.endAt, timezone))}`;
}

const card = "rounded-[12px] border border-border bg-card px-4 py-[13px]";
const cardTitle = "font-display text-[15px] font-semibold tracking-[-0.02em]";

/**
 * Bookings › Availability (U16, the design's `?view=avail`): when each person
 * can be booked. Weekly hours, time off, one-off extra hours and the
 * business's booking rules are a draft until "Save hours"; saving writes
 * what changed, and Undo puts it all back. Hours never move a booking — the
 * ones left outside are listed and kept.
 */
export function AvailabilityEditor({
    staff,
    rules,
    timezone,
    today,
    kept,
    bookedOn,
    takesClasses,
    canEdit,
}: {
    staff: StaffView[];
    rules: BookingRules;
    timezone: string;
    today: LocalDate;
    /** This week's live bookings by person, or null when unread. */
    kept: KeptBooking[] | null;
    /** Live bookings per `${staffId}|${date}` over the next three weeks. */
    bookedOn: Record<string, number> | null;
    /** Who teaches a class — their dot is the class colour. */
    takesClasses: string[];
    canEdit: boolean;
}) {
    const router = useRouter();
    const people = staff.filter((p) => p.status === "ACTIVE");
    const [who, setWho] = useState(people[0]?.id ?? "");
    const [draft, setDraft] = useState<AvailabilityDraft | null>(null);
    const [saving, setSaving] = useState(false);
    const [offDate, setOffDate] = useState(addDays(today, 1));
    const [offWhy, setOffWhy] = useState("");
    const [adding, setAdding] = useState(false);

    const base = draftFrom(staff, rules);
    const d = draft ?? base;
    const ops = saveOps(staff, rules, d);
    const dirty = ops.length > 0;
    const me = people.find((p) => p.id === who) ?? people.at(0);
    const edit = (fn: (x: AvailabilityDraft) => void) => {
        const next = structuredClone(d);
        fn(next);
        setDraft(next);
    };

    async function save() {
        if (!dirty || saving) return;
        setSaving(true);
        const done: { op: SaveOp; addedId?: string }[] = [];
        const outside: BookingBrief[] = [];
        let failed: string | null = null;
        for (const op of ops) {
            const res =
                op.kind === "hours"
                    ? await replaceStaffHours(op.staffId, op.hours)
                    : op.kind === "addOff"
                      ? await addTimeOff(op.staffId, {
                            fromDate: op.date,
                            reason: op.reason || undefined,
                        })
                      : op.kind === "removeOff"
                        ? await removeTimeOff(op.staffId, op.before.id)
                        : op.kind === "removeExtra"
                          ? await removeExtraHours(op.staffId, op.before.id)
                          : await updateBookingRules(op.rules);
            if (!res.ok) {
                failed = res.error;
                break;
            }
            let addedId: string | undefined;
            if (op.kind === "hours") {
                outside.push(
                    ...(res.data as { outside: BookingBrief[] }).outside,
                );
            }
            if (op.kind === "addOff") {
                const at = zonedInstant(op.date, 0, timezone).getTime();
                addedId = (res.data as { staff: StaffView }).staff.timeOff.find(
                    (t) => Date.parse(t.startAt) === at,
                )?.id;
            }
            done.push({ op, addedId });
        }
        setSaving(false);
        router.refresh();
        if (failed) {
            // What was written stays written; the draft keeps the rest.
            showError(
                failed,
                done.length ? "Some of your changes were saved." : undefined,
            );
            return;
        }
        setDraft(null);
        showUndo(
            "Hours saved. The calendar and booking page use them now.",
            () => {
                void undo(done).then(() => router.refresh());
            },
        );
        if (outside.length) {
            showWarning(
                `${outside.length} ${outside.length === 1 ? "booking is" : "bookings are"} now outside the hours`,
                "They stay booked. Move them from the calendar if you need to.",
            );
        }
    }

    async function undo(done: { op: SaveOp; addedId?: string }[]) {
        for (const { op, addedId } of [...done].reverse()) {
            const res =
                op.kind === "hours"
                    ? await replaceStaffHours(op.staffId, op.before)
                    : op.kind === "addOff"
                      ? addedId
                          ? await removeTimeOff(op.staffId, addedId)
                          : null
                      : op.kind === "removeOff"
                        ? await addTimeOff(
                              op.staffId,
                              op.before.allDay
                                  ? {
                                        fromDate: localDateOf(
                                            op.before.startAt,
                                            timezone,
                                        ),
                                        toDate: localDateOf(
                                            new Date(
                                                Date.parse(op.before.endAt) - 1,
                                            ),
                                            timezone,
                                        ),
                                        reason: op.before.reason ?? undefined,
                                    }
                                  : {
                                        startAt: op.before.startAt,
                                        endAt: op.before.endAt,
                                        reason: op.before.reason ?? undefined,
                                    },
                          )
                        : op.kind === "removeExtra"
                          ? await addExtraHours(op.staffId, {
                                date: op.before.date.slice(0, 10),
                                startMinute: op.before.startMinute,
                                endMinute: op.before.endMinute,
                            })
                          : await updateBookingRules(op.before);
            if (res && !res.ok) {
                showError(res.error, "Undo stopped part of the way.");
                return;
            }
        }
    }

    if (!me) {
        return (
            <div className="rounded-[12px] border border-dashed border-border px-5 py-8 text-center">
                <p className="text-[14px] font-semibold">
                    Nobody takes bookings yet
                </p>
                <p className="mx-auto mt-1 max-w-[52ch] text-[12.5px] text-muted-foreground">
                    Add the people who can be booked. Each gets weekly hours,
                    time off and a column on the calendar.
                </p>
                {canEdit ? (
                    <Button
                        className="mt-3 h-[38px] rounded-[9px] px-4 text-[14px]"
                        onClick={() => setAdding(true)}
                    >
                        Add someone
                    </Button>
                ) : null}
                <AddPersonDialog
                    open={adding}
                    onOpenChange={setAdding}
                    onAdded={(id) => setWho(id)}
                />
            </div>
        );
    }

    const hours = d.hours[me.id] ?? [];
    // Time off that is over is history, not something to manage.
    const offMine = me.timeOff.filter(
        (t) =>
            !d.offRemoved.includes(t.id) &&
            localDateOf(new Date(Date.parse(t.endAt) - 1), timezone) >= today,
    );
    const offNew = d.offAdded.filter((o) => o.staffId === me.id);
    const extraMine = me.extraHours.filter(
        (x) => !d.extraRemoved.includes(x.id),
    );
    const offDays = Array.from({ length: 21 }, (_, i) => addDays(today, i));
    const taken = bookedOn?.[`${me.id}|${offDate}`] ?? 0;

    return (
        <>
            <div className="mb-1 flex flex-wrap items-center gap-3">
                <h1 className="m-0 font-display text-[28px] font-semibold leading-tight tracking-[-0.03em]">
                    Availability
                </h1>
                <span className="ml-auto text-[12.5px] text-muted-foreground">
                    {me.name} · {weeklyHours(hours)} hours a week
                </span>
            </div>
            <p className="mb-3.5 max-w-[70ch] text-[12.5px] text-muted-foreground">
                When each person can be booked. Customers only ever see free
                times inside these hours, minus bookings and the gap after each.
                Changing hours never moves a booking that&apos;s already made.
            </p>
            {canEdit ? null : (
                <ReadOnlyNote>
                    Your role can see these hours but not change them.
                </ReadOnlyNote>
            )}
            <div
                role="radiogroup"
                aria-label="Team member"
                className="mb-3.5 flex flex-wrap gap-1.5"
            >
                {people.map((p) => {
                    const on = p.id === me.id;
                    return (
                        <button
                            key={p.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setWho(p.id)}
                            className={cn(
                                "inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:h-11",
                                on
                                    ? "border-foreground bg-primary font-semibold text-primary-foreground"
                                    : "border-border bg-card font-medium hover:border-border-strong",
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "mr-[7px] inline-block size-2 rounded-full",
                                    takesClasses.includes(p.id)
                                        ? "bg-diary-class"
                                        : "bg-diary-one",
                                )}
                            />
                            {p.name}
                            {p.title ? ` · ${p.title}` : ""}
                        </button>
                    );
                })}
                {canEdit ? (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="h-8 rounded-full border border-dashed border-border-strong px-3 text-[12.5px] font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11"
                    >
                        + Add someone
                    </button>
                ) : null}
            </div>

            <div className="flex flex-wrap items-start gap-4">
                <WeeklyHours
                    staffId={me.id}
                    hours={hours}
                    kept={kept}
                    canEdit={canEdit}
                    onChange={(next) =>
                        edit((x) => {
                            x.hours[me.id] = next;
                        })
                    }
                />
                <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-3">
                    <section aria-labelledby="time-off" className={card}>
                        <h2 id="time-off" className={cn(cardTitle, "mb-2")}>
                            Time off
                        </h2>
                        <ul>
                            {offMine.map((t) => (
                                <OffRow
                                    key={t.id}
                                    when={timeOffWhen(t, timezone)}
                                    why={t.reason ?? "No reason given"}
                                    canEdit={canEdit}
                                    onRemove={() =>
                                        edit((x) => {
                                            x.offRemoved.push(t.id);
                                        })
                                    }
                                />
                            ))}
                            {offNew.map((o) => (
                                <OffRow
                                    key={o.key}
                                    when={`${dayLabel(o.date)} · all day`}
                                    why={`${o.reason === "" ? "No reason given" : o.reason} · not saved yet`}
                                    canEdit={canEdit}
                                    onRemove={() =>
                                        edit((x) => {
                                            x.offAdded = x.offAdded.filter(
                                                (y) => y.key !== o.key,
                                            );
                                        })
                                    }
                                />
                            ))}
                        </ul>
                        {!offMine.length && !offNew.length ? (
                            <p className="text-[12.5px] text-muted-foreground">
                                None booked.
                            </p>
                        ) : null}
                        {canEdit ? (
                            <>
                                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                    <OptionSelect
                                        aria-label="Day off"
                                        value={offDate}
                                        onValueChange={setOffDate}
                                        className="h-8 w-auto rounded-[8px] text-[12.5px]"
                                        options={offDays.map((v) => ({
                                            value: v,
                                            label: dayLabel(v),
                                        }))}
                                    />
                                    <Input
                                        aria-label="Reason (team only)"
                                        placeholder="Reason — team only"
                                        value={offWhy}
                                        onChange={(e) =>
                                            setOffWhy(e.target.value)
                                        }
                                        className="h-8 min-w-0 flex-[1_1_120px] rounded-[8px] text-[12.5px]"
                                    />
                                    <Button
                                        variant="outline"
                                        className="h-[38px] rounded-[9px] px-4 text-[14px]"
                                        onClick={() => {
                                            edit((x) => {
                                                x.offAdded.push({
                                                    key: `${me.id}${offDate}${x.offAdded.length}`,
                                                    staffId: me.id,
                                                    date: offDate,
                                                    reason: offWhy.trim(),
                                                });
                                            });
                                            setOffWhy("");
                                        }}
                                    >
                                        Add day off
                                    </Button>
                                </div>
                                <p
                                    className={cn(
                                        "mt-[7px] text-[11.5px]",
                                        taken
                                            ? "text-brand-subtle-foreground"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {bookedOn === null
                                        ? "Bookings that day couldn't be checked."
                                        : taken
                                          ? `${taken} already booked that day — ${taken === 1 ? "it's" : "they're"} kept; move or cancel ${taken === 1 ? "it" : "them"} from the calendar.`
                                          : "Nothing booked that day."}
                                </p>
                            </>
                        ) : null}
                    </section>

                    <section aria-labelledby="extra-hours" className={card}>
                        <h2 id="extra-hours" className={cn(cardTitle, "mb-1")}>
                            One-off extra hours
                        </h2>
                        <p className="mb-1.5 text-[11.5px] text-muted-foreground">
                            Opened on the calendar for a single day.
                        </p>
                        <ul>
                            {extraMine.map((x) => {
                                const n =
                                    bookedOn?.[
                                        `${me.id}|${x.date.slice(0, 10)}`
                                    ] ?? 0;
                                return (
                                    <OffRow
                                        key={x.id}
                                        when={`${dayLabel(x.date.slice(0, 10))} · ${clock(x.startMinute)}–${clock(x.endMinute)}`}
                                        why={
                                            n
                                                ? `${n} ${n === 1 ? "booking" : "bookings"} that day — kept if you close these`
                                                : null
                                        }
                                        warn={n > 0}
                                        canEdit={canEdit}
                                        removeLabel={`Remove extra hours ${clock(x.startMinute)} to ${clock(x.endMinute)} on ${dayLabel(x.date.slice(0, 10))}`}
                                        onRemove={() =>
                                            edit((y) => {
                                                y.extraRemoved.push(x.id);
                                            })
                                        }
                                    />
                                );
                            })}
                        </ul>
                        {!extraMine.length ? (
                            <p className="text-[12.5px] text-muted-foreground">
                                None. Click closed time on the calendar to add
                                some.
                            </p>
                        ) : null}
                    </section>

                    <section aria-labelledby="booking-rules" className={card}>
                        <h2
                            id="booking-rules"
                            className={cn(cardTitle, "mb-2")}
                        >
                            Booking rules
                        </h2>
                        <p className="mb-2 text-[11.5px] text-muted-foreground">
                            For the whole business.
                        </p>
                        {ruleChoices(d.rules).map((r) => (
                            <div
                                key={r.key}
                                className="flex items-center gap-2 py-1.5"
                            >
                                <span className="flex-1 text-[13px]">
                                    {r.label}
                                </span>
                                <OptionSelect
                                    aria-label={r.label}
                                    disabled={!canEdit}
                                    value={
                                        d.rules[r.key] === null
                                            ? ""
                                            : String(d.rules[r.key])
                                    }
                                    onValueChange={(v) =>
                                        edit((x) => {
                                            x.rules[r.key] =
                                                v === "" ? null : Number(v);
                                        })
                                    }
                                    className="h-8 w-auto rounded-[8px] text-[12.5px]"
                                    options={r.options}
                                />
                            </div>
                        ))}
                    </section>
                </div>
            </div>

            {dirty ? (
                <div className="sticky bottom-[calc(12px+var(--tab-bar-inset,0px))] z-10 mt-3.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-highlight-border bg-muted/70 px-3.5 py-[11px] backdrop-blur-sm dark:bg-muted">
                    <span
                        role="status"
                        className="flex-[1_1_240px] text-[12.5px] text-foreground"
                    >
                        Unsaved. New free times show on the calendar and the
                        booking page when you save; bookings already made
                        don&apos;t move.
                    </span>
                    <Button
                        variant="outline"
                        className="h-[38px] rounded-[9px] px-4 text-[14px]"
                        disabled={saving}
                        onClick={() => setDraft(null)}
                    >
                        Discard
                    </Button>
                    <Button
                        className="h-[38px] rounded-[9px] px-4 text-[14px]"
                        disabled={saving}
                        onClick={() => void save()}
                    >
                        {saving ? "Saving…" : "Save hours"}
                    </Button>
                </div>
            ) : null}
            <AddPersonDialog
                open={adding}
                onOpenChange={setAdding}
                onAdded={(id) => setWho(id)}
            />
        </>
    );
}

function OffRow({
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
