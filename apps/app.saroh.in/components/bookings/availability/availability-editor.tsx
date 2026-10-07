"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo, showWarning } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import type {
    AvailabilityDraft,
    KeptBooking,
    NewOff,
    SaveOp,
} from "@/lib/services/availability-rules";
import {
    draftFrom,
    saveOps,
    weeklyHours,
} from "@/lib/services/availability-rules";
import type { LocalDate } from "@/lib/services/diary";
import { clock, dayLabel } from "@/lib/services/diary";
import {
    addClosure,
    addExtraHours,
    addTimeOff,
    removeClosures,
    removeExtraHours,
    removeTimeOffMany,
    replaceStaffHours,
    updateBookingRules,
} from "@/lib/staff/actions";
import type { TimeOffInput } from "@/lib/staff/service";
import type { OffLine } from "@/lib/staff/time-off";
import type {
    BookingBrief,
    BookingRules,
    Closure,
    OnlineBlocker,
    StaffView,
    WeeklyRange,
} from "@/lib/staff/types";

import { AddPersonDialog } from "./add-person-dialog";
import { BookingRulesCard } from "./booking-rules-card";
import { OffRow, TimeOffCard } from "./time-off-card";
import { WeeklyHours } from "./weekly-hours";

/** A new line of time off as the API takes it. */
function rangeOf(off: NewOff): TimeOffInput {
    return {
        fromDate: off.fromDate,
        toDate: off.toDate,
        ...(off.startMinute !== null && off.endMinute !== null
            ? { startMinute: off.startMinute, endMinute: off.endMinute }
            : {}),
        reason: off.reason || undefined,
    };
}

/**
 * A removed line as the API takes it back, for Undo: one part-day row of a
 * person's goes back exactly as it was; anything else as its range.
 */
function rangeOfLine(line: OffLine, closed: boolean): TimeOffInput {
    const row = line.rows[0];
    if (!closed && !line.allDay && line.rows.length === 1) {
        return {
            startAt: row.startAt,
            endAt: row.endAt,
            reason: row.reason ?? undefined,
        };
    }
    return rangeOf({
        key: "",
        staffId: null,
        fromDate: line.fromDate,
        toDate: line.toDate,
        startMinute: line.startMinute,
        endMinute: line.endMinute,
        reason: line.reason ?? "",
    });
}

const card = "rounded-[12px] border border-border bg-card px-4 py-[13px]";

/** Only the booking rules changed: no hours, time off or extra hours. */
function rulesOnly(ops: readonly SaveOp[]): boolean {
    return ops.length > 0 && ops.every((op) => op.kind === "rules");
}

/** The save bar's line: what saving will do. */
export function unsavedText(ops: readonly SaveOp[]): string {
    return rulesOnly(ops)
        ? "Unsaved. New bookings follow the rules when you save; bookings already made keep theirs."
        : "Unsaved. New free times show on the calendar and the booking page when you save; bookings already made don't move.";
}

/** The toast once saved: never "Hours saved" for a rule (UX-022). */
export function savedText(ops: readonly SaveOp[]): string {
    return rulesOnly(ops)
        ? "Booking rules saved. New bookings follow them now."
        : "Saved. The calendar and booking page use them now.";
}

/** Settings › Hours, where the business's opening hours are kept. */
const HOURS = "/settings/organization?section=hours";
const cardTitle = "font-display text-[15px] font-semibold tracking-[-0.02em]";

/**
 * Bookings › Availability (U16, the design's `?view=avail`): when each person
 * can be booked. Weekly hours, time off, one-off extra hours and the
 * business's booking rules are a draft until "Save changes"; saving writes
 * what changed, and Undo puts it all back. Hours never move a booking — the
 * ones left outside are listed and kept. The booking rules show with nobody
 * on the diary too (UX-022): a solo owner sets how people pay and cancel.
 */
export function AvailabilityEditor({
    staff,
    closures,
    openingHours,
    rules,
    timezone,
    today,
    kept,
    bookedOn,
    takesClasses,
    canEdit,
    onlineBlocker,
}: {
    staff: StaffView[];
    /** When the whole business is closed (E3). */
    closures: Closure[];
    /** When the business is open (DEC-087), or null with no shop hours. */
    openingHours: WeeklyRange[] | null;
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
    /**
     * Why the booking page can't take money online now (DEC-088); null
     * when it can, undefined when it couldn't be told.
     */
    onlineBlocker?: OnlineBlocker | null;
}) {
    const router = useRouter();
    const people = staff.filter((p) => p.status === "ACTIVE");
    const [who, setWho] = useState(people[0]?.id ?? "");
    const [draft, setDraft] = useState<AvailabilityDraft | null>(null);
    const [saving, setSaving] = useState(false);
    const [adding, setAdding] = useState(false);

    const base = draftFrom(staff, rules);
    const d = draft ?? base;
    const ops = saveOps(staff, rules, d, closures, timezone);
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
        const done: { op: SaveOp; addedIds?: string[] }[] = [];
        const outside: BookingBrief[] = [];
        const covered = new Set<string>();
        // Ids already there, so an add's new rows can be told apart for Undo.
        const known = new Set([
            ...closures.map((c) => c.id),
            ...staff.flatMap((p) => p.timeOff.map((t) => t.id)),
        ]);
        let failed: string | null = null;
        for (const op of ops) {
            const res =
                op.kind === "hours"
                    ? await replaceStaffHours(op.staffId, op.hours)
                    : op.kind === "addOff"
                      ? op.off.staffId
                          ? await addTimeOff(op.off.staffId, rangeOf(op.off))
                          : await addClosure({
                                ...rangeOf(op.off),
                                fromDate: op.off.fromDate,
                            })
                      : op.kind === "removeOff"
                        ? await removeTimeOffMany(op.staffId, op.before.ids)
                        : op.kind === "removeClosure"
                          ? await removeClosures(op.before.ids)
                          : op.kind === "removeExtra"
                            ? await removeExtraHours(op.staffId, op.before.id)
                            : await updateBookingRules(op.rules);
            if (!res.ok) {
                failed = res.error;
                break;
            }
            let addedIds: string[] | undefined;
            if (op.kind === "hours") {
                outside.push(
                    ...(res.data as { outside: BookingBrief[] }).outside,
                );
            }
            if (op.kind === "addOff") {
                const data = res.data as {
                    staff?: StaffView;
                    closures?: Closure[];
                    affected: BookingBrief[];
                };
                const rows = data.staff?.timeOff ?? data.closures ?? [];
                addedIds = rows.map((r) => r.id).filter((x) => !known.has(x));
                for (const x of addedIds) known.add(x);
                for (const b of data.affected) covered.add(b.id);
            }
            done.push({ op, addedIds });
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
        showUndo(savedText(ops), () => {
            void undo(done).then(() => router.refresh());
        });
        if (outside.length) {
            showWarning(
                `${outside.length} ${outside.length === 1 ? "booking is" : "bookings are"} now outside the hours`,
                "They stay booked. Move them from the calendar if you need to.",
            );
        }
        if (covered.size) {
            showWarning(
                `${covered.size} ${covered.size === 1 ? "booking falls" : "bookings fall"} in the time off`,
                "They stay booked. Move or cancel them from the calendar.",
            );
        }
    }

    async function undo(done: { op: SaveOp; addedIds?: string[] }[]) {
        for (const { op, addedIds } of [...done].reverse()) {
            const res =
                op.kind === "hours"
                    ? await replaceStaffHours(op.staffId, op.before)
                    : op.kind === "addOff"
                      ? !addedIds?.length
                          ? null
                          : op.off.staffId
                            ? await removeTimeOffMany(op.off.staffId, addedIds)
                            : await removeClosures(addedIds)
                      : op.kind === "removeOff"
                        ? await addTimeOff(
                              op.staffId,
                              rangeOfLine(op.before, false),
                          )
                        : op.kind === "removeClosure"
                          ? await addClosure({
                                ...rangeOfLine(op.before, true),
                                fromDate: op.before.fromDate,
                            })
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

    const saveBar = dirty ? (
        <div className="sticky bottom-[calc(12px+var(--tab-bar-inset,0px))] z-10 mt-3.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-highlight-border bg-muted/70 px-3.5 py-[11px] backdrop-blur-sm dark:bg-muted">
            <span
                role="status"
                className="flex-[1_1_240px] text-[12.5px] text-foreground"
            >
                {unsavedText(ops)}
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
                {saving ? "Saving…" : "Save changes"}
            </Button>
        </div>
    ) : null;

    if (!me) {
        // Nobody on the diary yet — a solo owner whose services keep their
        // own hours. The business's booking rules still apply to every
        // booking, so they are here all the same (UX-022).
        return (
            <>
                <h1 className="mb-3.5 font-display text-[28px] font-semibold leading-tight tracking-[-0.03em]">
                    Availability
                </h1>
                {canEdit ? null : (
                    <ReadOnlyNote>
                        Your role can see these rules but not change them.
                    </ReadOnlyNote>
                )}
                <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-[3_1_320px] rounded-[12px] border border-dashed border-border px-5 py-8 text-center">
                        <p className="text-[14px] font-semibold">
                            Nobody takes bookings yet
                        </p>
                        <p className="mx-auto mt-1 max-w-[52ch] text-[12.5px] text-muted-foreground">
                            Add the people who can be booked. Each gets weekly
                            hours, time off and a column on the calendar.
                        </p>
                        {canEdit ? (
                            <Button
                                className="mt-3 h-[38px] rounded-[9px] px-4 text-[14px]"
                                onClick={() => setAdding(true)}
                            >
                                Add someone
                            </Button>
                        ) : null}
                        <p className="mx-auto mt-2 max-w-[52ch] text-[12.5px] text-muted-foreground">
                            Until then, customers book each service in its own
                            weekly hours, set on the service.
                        </p>
                        <AddPersonDialog
                            open={adding}
                            onOpenChange={setAdding}
                            onAdded={(id) => setWho(id)}
                        />
                    </div>
                    <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-3">
                        <BookingRulesCard
                            rules={d.rules}
                            canEdit={canEdit}
                            onlineBlocker={onlineBlocker}
                            onChange={(fn) => edit((x) => fn(x.rules))}
                        />
                    </div>
                </div>
                {saveBar}
            </>
        );
    }

    const hours = d.hours[me.id] ?? [];
    const extraMine = me.extraHours.filter(
        (x) => !d.extraRemoved.includes(x.id),
    );

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
            {openingHours ? (
                <p className="-mt-2 mb-3.5 max-w-[70ch] text-[12.5px] text-muted-foreground">
                    In-person bookings are only offered while you&apos;re open,
                    so hours outside your opening hours aren&apos;t bookable in
                    person. Opening hours are in{" "}
                    <Link
                        href={HOURS}
                        className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
                    >
                        Settings › Hours
                    </Link>
                    .
                </p>
            ) : null}
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
                    opening={openingHours}
                    kept={kept}
                    canEdit={canEdit}
                    onChange={(next) =>
                        edit((x) => {
                            x.hours[me.id] = next;
                        })
                    }
                />
                <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-3">
                    <TimeOffCard
                        key={me.id}
                        me={me}
                        closures={closures}
                        timezone={timezone}
                        today={today}
                        canEdit={canEdit}
                        offAdded={d.offAdded}
                        offRemoved={d.offRemoved}
                        onAdd={(off) =>
                            edit((x) => {
                                x.offAdded.push({
                                    ...off,
                                    key: `${off.staffId ?? "all"}${off.fromDate}${x.offAdded.length}`,
                                });
                            })
                        }
                        onRemoveSaved={(ids) =>
                            edit((x) => {
                                x.offRemoved.push(...ids);
                            })
                        }
                        onRemoveNew={(key) =>
                            edit((x) => {
                                x.offAdded = x.offAdded.filter(
                                    (y) => y.key !== key,
                                );
                            })
                        }
                    />

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

                    <BookingRulesCard
                        rules={d.rules}
                        canEdit={canEdit}
                        onlineBlocker={onlineBlocker}
                        onChange={(fn) => edit((x) => fn(x.rules))}
                    />
                </div>
            </div>

            {saveBar}
            <AddPersonDialog
                open={adding}
                onOpenChange={setAdding}
                onAdded={(id) => setWho(id)}
            />
        </>
    );
}
