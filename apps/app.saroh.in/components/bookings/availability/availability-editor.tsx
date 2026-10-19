"use client";

import { formatClockRange, formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { showError, showUndo, showWarning } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { useLeaveGuard } from "@/components/shared/use-leave-guard";
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
import {
    addClosure,
    addExtraHours,
    addMyself,
    addTimeOff,
    removeClosures,
    removeExtraHours,
    removeTimeOffMany,
    replaceStaffHours,
    updateStaff,
} from "@/lib/staff/actions";
import type { TimeOffInput } from "@/lib/staff/service";
import { hasOpening, weekLines } from "@/lib/staff/starting-week";
import type { OffLine } from "@/lib/staff/time-off";
import type {
    BookingBrief,
    BookingRules,
    Closure,
    OnlineBlocker,
    StaffView,
    WeeklyRange,
} from "@/lib/staff/types";
import { EmptyState } from "@saroh/ui/data-state";

import { ChipGroup } from "@/components/shared/choice-group";
import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { TextLink } from "@saroh/ui/text-link";
import { AddPersonDialog } from "./add-person-dialog";
import { BookablePreview } from "./bookable-preview";
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

/**
 * The save bar's line: what saving will do. Only hours, time off and extra
 * hours wait for Save now; a booking rule saves in its own sheet.
 */
export function unsavedText(): string {
    return "Unsaved. New free times show on the calendar and the booking page when you save. Bookings already made don't move.";
}

/** The toast once the page's draft is saved. */
export function savedText(): string {
    return "Saved. The calendar and booking page use them now.";
}

/** "It's just me", once they are on the diary: which week they started with. */
export function joinedText(week: "opening" | "default"): string {
    return week === "opening"
        ? "You're on the diary with your opening hours."
        : "You're on the diary with a starting week.";
}

/** Settings › Hours, where the business's opening hours are kept. */
const HOURS = "/settings/organization?section=hours";
const cardTitle = "font-display text-[15px] font-semibold tracking-[-0.02em]";

/**
 * Bookings › Availability (U16, the design's `?view=avail`): when people
 * can book. Each person's weekly hours, time off and one-off extra hours
 * are a draft until "Save"; saving writes what changed, and Undo puts it
 * all back. Hours never move a booking: the ones left outside are listed
 * and kept. Beside the week, "What customers see" shows the times the
 * booking page offers. Under it, the business's booking rules are
 * sentences in rows, each changed in its own sheet, so a rule never
 * raises the page's unsaved bar.
 *
 * With nobody on the diary the screen still answers the question: "It's
 * just me" puts the signed-in person on it in one press with the opening
 * hours as their week, "Add my team" opens the add-person dialog, and
 * under them is the week customers can book today, from each service's
 * own hours. The booking rules show there too (UX-022).
 */
export function AvailabilityEditor({
    staff,
    closures,
    openingHours,
    rules,
    serviceHours = null,
    services = [],
    seatNote = null,
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
    /** When the business is open (DEC-087, DEC-096), or null with no hours saved. */
    openingHours: WeeklyRange[] | null;
    /** The saved booking rules, or null when they couldn't be read. */
    rules: BookingRules | null;
    /**
     * With nobody on the diary: the services' own weekly hours together,
     * as the calendar's "Service hours" column reads them; null when no
     * service on the booking page has hours.
     */
    serviceHours?: WeeklyRange[] | null;
    /** The services the booking page offers, for "What customers see". */
    services?: { id: string; name: string }[];
    /** Said in the add-person dialog only when the plan counts seats. */
    seatNote?: string | null;
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
    const [joining, setJoining] = useState(false);

    const base = draftFrom(staff);
    const d = draft ?? base;
    const ops = saveOps(staff, d, closures, timezone);
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
            const res = await runAction(
                async () =>
                    op.kind === "hours"
                        ? await replaceStaffHours(op.staffId, op.hours)
                        : op.kind === "addOff"
                          ? op.off.staffId
                              ? await addTimeOff(
                                    op.off.staffId,
                                    rangeOf(op.off),
                                )
                              : await addClosure({
                                    ...rangeOf(op.off),
                                    fromDate: op.off.fromDate,
                                })
                          : op.kind === "removeOff"
                            ? await removeTimeOffMany(op.staffId, op.before.ids)
                            : op.kind === "removeClosure"
                              ? await removeClosures(op.before.ids)
                              : await removeExtraHours(
                                    op.staffId,
                                    op.before.id,
                                ),
                // Said below, with what did save.
                { quiet: true },
            );
            if (!res) {
                failed = UNREACHED;
                break;
            }
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
        showUndo(savedText(), async () => {
            await undo(done);
            router.refresh();
        });
        if (outside.length) {
            showWarning(
                `${count(outside.length, "booking is", "bookings are")} now outside the hours.`,
                "They stay booked. Move them from the calendar if you need to.",
            );
        }
        if (covered.size) {
            showWarning(
                `${count(covered.size, "booking falls", "bookings fall")} in the time off.`,
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
                          : await addExtraHours(op.staffId, {
                                date: op.before.date.slice(0, 10),
                                startMinute: op.before.startMinute,
                                endMinute: op.before.endMinute,
                            });
            if (res && !res.ok) {
                showError(res.error, "Undo stopped part of the way.");
                return;
            }
        }
    }

    /**
     * "It's just me": the signed-in person goes on the diary with the
     * opening hours as their week, and lands on it here. Undo takes them
     * off again (archived, as the API has no other way off the diary).
     */
    async function justMe() {
        const res = await runAction(() => addMyself(), {
            setBusy: setJoining,
        });
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        const { staff: mine, week } = res.data;
        setWho(mine.id);
        router.refresh();
        showUndo(
            joinedText(week),
            async () => {
                const back = await updateStaff(mine.id, {
                    status: "ARCHIVED",
                });
                if (!back.ok) return back;
                router.refresh();
                return { ok: true };
            },
            { description: "Your week is below. Change it any time." },
        );
    }

    // Hours, time off and extra hours wait for "Save": a way off the page
    // asks first. A booking rule saves in its own sheet.
    const guard = useLeaveGuard({
        dirty: canEdit && dirty && !saving,
        lost: "Your changes to hours or time off aren't saved, and will be lost.",
    });

    const saveBar = dirty ? (
        <div className="sticky bottom-[calc(12px+var(--tab-bar-inset,0px))] z-10 mt-3.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-border-strong bg-muted/70 px-3.5 py-[11px] backdrop-blur-sm dark:bg-muted">
            <span
                role="status"
                className="flex-[1_1_240px] text-[12.5px] text-foreground"
            >
                {unsavedText()}
            </span>
            <Button
                variant="outline"
                disabled={saving}
                onClick={() => setDraft(null)}
            >
                Discard
            </Button>
            <Button
                onClick={() => void save()}
                busy={saving}
                busyLabel="Saving…"
            >
                Save
            </Button>
        </div>
    ) : null;

    const dialog = (
        <AddPersonDialog
            open={adding}
            onOpenChange={setAdding}
            onAdded={(id) => setWho(id)}
            week={hasOpening(openingHours) ? "opening" : "default"}
            seatNote={seatNote}
        />
    );
    const rulesCard = (
        <BookingRulesCard
            rules={rules}
            canEdit={canEdit}
            onlineBlocker={onlineBlocker}
        />
    );

    if (!me) {
        // Nobody on the diary yet: most often a solo owner, whose services
        // keep their own hours until they put themselves on it.
        const week = serviceHours?.length ? weekLines(serviceHours) : null;
        return (
            <>
                <PageHeader
                    className="mb-5"
                    breadcrumb={["Bookings", "Hours and time off"]}
                    title="Hours and time off"
                />
                {canEdit ? null : (
                    <ReadOnlyNote>
                        Your role can see these rules but not change them.
                    </ReadOnlyNote>
                )}
                <div className="grid max-w-[760px] gap-5">
                    <section
                        aria-labelledby="availability-start"
                        className="rounded-[12px] border border-border bg-card px-4 py-4 sm:px-5"
                    >
                        <h2
                            id="availability-start"
                            className="font-display text-[17px] font-semibold tracking-[-0.02em]"
                        >
                            When can people book you?
                        </h2>
                        <p className="mt-1 max-w-[56ch] text-pretty text-[13px] text-muted-foreground">
                            {!canEdit
                                ? "Nobody is on the diary yet."
                                : hasOpening(openingHours)
                                  ? "Put yourself on the diary with your opening hours, or add your team."
                                  : "Put yourself on the diary with a starting week, or add your team."}
                        </p>
                        {canEdit ? (
                            <div className="mt-3.5 flex flex-col gap-2 sm:flex-row">
                                <Button
                                    onClick={() => void justMe()}
                                    busy={joining}
                                    busyLabel="Adding you…"
                                >
                                    It&apos;s just me
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={joining}
                                    onClick={() => setAdding(true)}
                                >
                                    Add my team
                                </Button>
                            </div>
                        ) : null}
                        <div className="mt-4 border-t border-border pt-3.5">
                            <h3 className="text-[13px] font-semibold">
                                What customers can book now
                            </h3>
                            {week ? (
                                <>
                                    <p className="mt-0.5 text-pretty text-[12.5px] text-muted-foreground">
                                        With nobody on the diary, each service
                                        is booked in its own hours. Together
                                        they cover:
                                    </p>
                                    <dl
                                        data-testid="bookable-week"
                                        className="mt-2 grid gap-y-1 text-[13px] tabular-nums"
                                    >
                                        {week.map((line) => (
                                            <div
                                                key={line.days}
                                                className="flex flex-wrap gap-x-3"
                                            >
                                                <dt className="w-[11rem] shrink-0 font-medium">
                                                    {line.days}
                                                </dt>
                                                <dd
                                                    className={cn(
                                                        "min-w-0",
                                                        !line.hours &&
                                                            "text-muted-foreground",
                                                    )}
                                                >
                                                    {line.hours ??
                                                        "Not bookable"}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </>
                            ) : (
                                <EmptyState
                                    size="inline"
                                    className="mt-0.5"
                                    title="Nothing yet"
                                    description="No service on your booking page has hours."
                                />
                            )}
                        </div>
                    </section>
                    {rulesCard}
                </div>
                {dialog}
            </>
        );
    }

    const hours = d.hours[me.id] ?? [];
    const extraMine = me.extraHours.filter(
        (x) => !d.extraRemoved.includes(x.id),
    );

    return (
        <>
            <PageHeader
                className="mb-5"
                breadcrumb={["Bookings", "Hours and time off"]}
                title="Hours and time off"
                description="When each person can be booked. Customers only ever see free times inside these hours, minus bookings and the break after each. Changing hours never moves a booking that's already made."
                meta={`${me.name} · ${weeklyHours(hours)} hours a week`}
            />
            {openingHours ? (
                <p className="-mt-2 mb-3.5 max-w-[70ch] text-[12.5px] text-muted-foreground">
                    In-person bookings are only offered while you&apos;re open,
                    so hours outside your opening hours aren&apos;t bookable in
                    person. Opening hours are in{" "}
                    <TextLink href={HOURS}>Settings › Hours</TextLink>.
                </p>
            ) : null}
            {canEdit ? null : (
                <ReadOnlyNote>
                    Your role can see these hours but not change them.
                </ReadOnlyNote>
            )}
            <div className="mb-3.5 flex flex-wrap gap-1.5">
                <ChipGroup
                    label="Team member"
                    value={me.id}
                    onChange={setWho}
                    choices={people.map((p) => ({
                        value: p.id,
                        label: (
                            <>
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
                            </>
                        ),
                    }))}
                />
                {canEdit ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAdding(true)}
                        className="h-8 rounded-full border-dashed border-border-strong px-3 text-[12.5px] font-semibold"
                    >
                        + Add someone
                    </Button>
                ) : null}
            </div>

            <div className="flex flex-wrap items-start gap-4">
                <WeeklyHours
                    key={me.id}
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
                    <BookablePreview
                        // Its own key: the card below is keyed by the person
                        // too, and siblings may not share one.
                        key={`preview-${me.id}`}
                        person={me}
                        services={services.filter((x) =>
                            me.serviceIds.includes(x.id),
                        )}
                        today={today}
                        timezone={timezone}
                        stamp={JSON.stringify([
                            me.hours,
                            me.extraHours,
                            me.timeOff,
                            closures,
                            rules,
                        ])}
                        dirty={dirty}
                    />
                    <TimeOffCard
                        key={`off-${me.id}`}
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
                            Extra opening hours
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
                                        when={`${formatDay(x.date.slice(0, 10), { weekday: "short", year: "never" })} · ${formatClockRange(x.startMinute, x.endMinute)}`}
                                        why={
                                            n
                                                ? `${count(n, "booking")} that day, kept if you close these`
                                                : null
                                        }
                                        warn={n > 0}
                                        canEdit={canEdit}
                                        removeLabel={`Remove extra hours ${formatClockRange(x.startMinute, x.endMinute)} on ${formatDay(x.date.slice(0, 10), { weekday: "short", year: "never" })}`}
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
                            <EmptyState
                                size="inline"
                                title="No extra hours"
                                description={
                                    canEdit
                                        ? "Choose closed time on the calendar to add some."
                                        : undefined
                                }
                            />
                        ) : null}
                    </section>
                </div>
            </div>

            {/* Under the week, not beside it: rules are set once and read
                often, and they aren't availability. */}
            <div className="mt-6 max-w-[760px]">{rulesCard}</div>
            {saveBar}
            {dialog}
            {guard.dialog}
        </>
    );
}
