"use client";

import { Button } from "@saroh/ui/button";
import { Calendar } from "@saroh/ui/calendar";
import { chipClass } from "@saroh/ui/chip";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { Skeleton } from "@saroh/ui/skeleton";
import { showError, showSuccess } from "@saroh/ui/toast";
import { CalendarDays, Clock, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { ChoiceGroup } from "@/components/shared/choice-group";
import { FailedRead } from "@/components/shared/failed-read";
import { runAction } from "@/lib/api/run-action";
import { formatDay, formatTime } from "@/lib/format/datetime";
import { firstName } from "@/lib/names";
import {
    bookByHand,
    bookVisit,
    listAvailability,
} from "@/lib/services/actions";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { LocalDate } from "@/lib/services/diary";
import {
    addDays,
    localDateOf,
    whoFor,
    zonedInstant,
} from "@/lib/services/diary";
import type { Slot } from "@/lib/services/service";
import { takenMessage, zoneShortName } from "@/lib/services/time-picker";
import { visitToBook } from "@/lib/services/treatment";

import { QL_BTN, StepBody, StepFoot, StepHead } from "./quick-look-parts";
import type { NextDayChoice } from "./quick-look-state";
import { isTakenRefusal, nextVisitDay } from "./quick-look-state";
import type { QuickLookContext } from "./quick-look-types";

/** Who a booking by hand is for: a contact, an email, or a name and phone. */
type WhoFor =
    | { contactId: string }
    | { bookerEmail: string; bookerName?: string; bookerPhone?: string }
    | { bookerPhone: string; bookerName: string };

/** Who the booking was for, as New booking takes them; null when unknown. */
export function bookerOf(
    b: Pick<
        DiaryBooking,
        "contact" | "bookerName" | "bookerEmail" | "bookerPhone"
    >,
): WhoFor | null {
    if (b.contact) return { contactId: b.contact.id };
    const name = b.bookerName?.trim() ?? "";
    const phone = b.bookerPhone?.trim() ?? "";
    if (phone && name) return { bookerPhone: phone, bookerName: name };
    const email = b.bookerEmail?.trim() ?? "";
    if (email) {
        return {
            bookerEmail: email,
            ...(name ? { bookerName: name } : {}),
            ...(phone ? { bookerPhone: phone } : {}),
        };
    }
    return null;
}

/** Whether "Book their next visit" can be offered for this booking. */
export function canBookNext(b: DiaryBooking): boolean {
    if (b.service.capacity > 1) return false;
    if (b.treatment) return visitToBook(b.treatment, whoFor(b)) !== null;
    return bookerOf(b) !== null;
}

type Read =
    { key: string; slots: Slot[] } | { key: string; failed: true } | null;

/**
 * Book their next visit (Q16, BKMNextVisit, BKDQuickLook "next visit"):
 * the same service and person, the day left to the merchant: Tomorrow,
 * Next week or any date, then that day's free times with that person. A
 * visit of a treatment books its next visit on its order (E10); anyone
 * else is booked as the booking by hand is, paying at the visit (DEC-170).
 */
export function NextVisitStep({
    booking: b,
    ctx,
    initial,
    onBack,
    onClose,
}: {
    booking: DiaryBooking;
    ctx: QuickLookContext;
    initial: NextDayChoice | null;
    onBack: () => void;
    onClose: () => void;
}) {
    const router = useRouter();
    const ids = { day: useId(), times: useId() };
    const tz = ctx.timezone;
    const today = localDateOf(new Date(ctx.now), tz);
    const [choice, setChoice] = useState<NextDayChoice | null>(initial);
    const [day, setDay] = useState<LocalDate | null>(
        initial && initial !== "pick" ? nextVisitDay(initial, today) : null,
    );
    const [time, setTime] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [read, setRead] = useState<Read>(null);
    const [taken, setTaken] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [key, setKey] = useState(() => crypto.randomUUID());
    const who = whoFor(b);
    const first = firstName(who);
    const person = b.staff;
    const visit = visitToBook(b.treatment, who);
    const readKey = day ? `${day}:${attempt}` : null;

    useEffect(() => {
        if (!day || !readKey) return;
        let live = true;
        const from = zonedInstant(day, 0, tz).toISOString();
        const to = zonedInstant(addDays(day, 1), 0, tz).toISOString();
        void listAvailability(b.serviceId, from, to, person?.id)
            .then((slots) => {
                if (live) {
                    setRead({
                        key: readKey,
                        slots: slots.filter(
                            (s) => Date.parse(s.startAt) > ctx.now,
                        ),
                    });
                }
            })
            .catch(() => {
                if (live) setRead({ key: readKey, failed: true });
            });
        return () => {
            live = false;
        };
    }, [b.serviceId, ctx.now, day, person?.id, readKey, tz]);

    const shown = read?.key === readKey ? read : null;
    const short = (d: LocalDate) =>
        formatDay(d, { weekday: "short", year: "never" })
            .split(" ")
            .slice(0, 2)
            .join(" ");
    const dayWords = day
        ? formatDay(day, { weekday: "short", year: "never" })
        : "";
    const zone = zoneShortName(tz, ctx.now);

    function pickDay(next: LocalDate | null) {
        setDay(next);
        setTime(null);
        setTaken(null);
    }

    async function book() {
        if (!time || busy) return;
        const booker = bookerOf(b);
        const request = visit
            ? () =>
                  bookVisit(visit.orderId, {
                      visitNumber: visit.visitNumber,
                      startAt: time,
                      ...(person ? { staffId: person.id } : {}),
                  })
            : booker
              ? () =>
                    bookByHand(b.serviceId, {
                        ...booker,
                        startAt: time,
                        idempotencyKey: key,
                        // A booking by hand pays at the visit (DEC-170).
                        paidWith: "DESK",
                        ...(person ? { staffId: person.id } : {}),
                    })
              : null;
        if (!request) return;
        const res = await runAction(request, { setBusy });
        if (!res) return;
        if (!res.ok) {
            setKey(crypto.randomUUID());
            if (res.plan) {
                showPlanRefusal(res.plan);
                return;
            }
            if (isTakenRefusal(res.error)) {
                setTaken(time);
                setTime(null);
                setAttempt((n) => n + 1);
                return;
            }
            showError("Couldn't book the next visit.", res.error);
            return;
        }
        showSuccess(
            `Booked ${first || "them"} for ${dayWords} at ${formatTime(time, tz)}.`,
            visit
                ? `Visit ${visit.visitNumber} of ${visit.visits}, on order #${visit.orderNumber}.`
                : undefined,
        );
        onClose();
        router.refresh();
    }

    const quick: { value: NextDayChoice; label: string }[] = [
        {
            value: "tomorrow",
            label: `Tomorrow · ${short(nextVisitDay("tomorrow", today))}`,
        },
        {
            value: "next-week",
            label: `Next week · ${short(nextVisitDay("next-week", today))}`,
        },
        { value: "pick", label: "Pick a date" },
    ];

    return (
        <>
            <StepHead
                line={`Next visit · ${who}`}
                title="Which day?"
                onBack={onBack}
                onClose={onClose}
            />
            <StepBody className="pt-3">
                {/* What is kept: the service and the person. */}
                <div
                    aria-label="Already picked"
                    className="flex flex-wrap gap-1.5 min-[760px]:hidden"
                >
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[12.5px] font-medium">
                        <Clock aria-hidden className="size-3.5" />
                        {b.service.name} · {b.service.durationMinutes} min
                    </span>
                    {person ? (
                        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[12.5px] font-medium">
                            <User aria-hidden className="size-3.5" />
                            With {firstName(person.name)}
                        </span>
                    ) : null}
                </div>
                <div className="hidden rounded-[12px] border border-border bg-card px-4 py-3 min-[760px]:block">
                    <span className="block text-[14px] font-semibold">
                        {b.service.name} · {b.service.durationMinutes} min
                    </span>
                    <span className="block text-[12.5px] text-muted-foreground">
                        {person
                            ? `With ${firstName(person.name)}`
                            : "Whoever is free"}
                    </span>
                </div>

                <span id={ids.day} className="sr-only">
                    Which day
                </span>
                <ChoiceGroup
                    labelledBy={ids.day}
                    className="mt-3.5 flex flex-wrap gap-1.5"
                    itemClassName={(on) =>
                        chipClass(on, "h-11 px-3.5 text-[13.5px]")
                    }
                    choices={quick}
                    value={choice}
                    onChange={(next) => {
                        setChoice(next);
                        pickDay(
                            next === "pick" ? null : nextVisitDay(next, today),
                        );
                    }}
                />
                {choice === null ? (
                    <p className="mt-3 text-[12.5px] leading-[1.5] text-muted-foreground">
                        Same service and person as today. Pick a day, as soon as
                        tomorrow.
                    </p>
                ) : null}
                {choice === "pick" ? (
                    <div className="mt-3 rounded-[12px] border border-border bg-card">
                        <Calendar
                            mode="single"
                            selected={
                                day ? new Date(`${day}T12:00:00Z`) : undefined
                            }
                            disabled={{
                                before: new Date(
                                    `${addDays(today, 1)}T12:00:00Z`,
                                ),
                            }}
                            onSelect={(picked) => {
                                if (!picked) return;
                                const y = picked.getFullYear();
                                const m = String(
                                    picked.getMonth() + 1,
                                ).padStart(2, "0");
                                const d = String(picked.getDate()).padStart(
                                    2,
                                    "0",
                                );
                                pickDay(`${y}-${m}-${d}`);
                            }}
                        />
                    </div>
                ) : null}

                {day ? (
                    <section aria-labelledby={ids.times} className="mt-4">
                        <div className="flex items-baseline gap-2">
                            <h3
                                id={ids.times}
                                className="flex-1 text-[15px] font-semibold"
                            >
                                {dayWords}
                            </h3>
                            <span className="text-[12.5px] text-muted-foreground">
                                {person
                                    ? `${firstName(person.name)}'s free times`
                                    : "Free times"}
                                {zone ? ` · ${zone}` : ""}
                            </span>
                        </div>
                        {taken ? (
                            <Notice tone="warning" className="mt-2">
                                {takenMessage(taken, tz)}
                            </Notice>
                        ) : null}
                        {!shown ? (
                            <div
                                aria-busy="true"
                                className="mt-2 grid grid-cols-3 gap-2"
                            >
                                <span className="sr-only">
                                    Finding free times…
                                </span>
                                {Array.from({ length: 6 }, (_, i) => (
                                    <Skeleton
                                        key={i}
                                        className="h-12 rounded-[10px]"
                                    />
                                ))}
                            </div>
                        ) : "failed" in shown ? (
                            <FailedRead
                                size="panel"
                                className="mt-2"
                                things="the free times"
                                reassurance="Nothing has been booked."
                                onRetry={() => setAttempt((n) => n + 1)}
                            />
                        ) : shown.slots.length === 0 ? (
                            <EmptyState
                                size="inline"
                                className="mt-2"
                                title={`No free times on ${dayWords}`}
                                description="Try another day."
                            />
                        ) : (
                            <ChoiceGroup
                                labelledBy={ids.times}
                                className="mt-2 grid grid-cols-3 gap-2"
                                itemClassName={(on) =>
                                    cn(
                                        "flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-[10px] border px-1 py-1 text-[14px] font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        on
                                            ? "border-foreground bg-primary text-primary-foreground"
                                            : "border-border bg-card text-foreground hover:border-border-strong",
                                    )
                                }
                                choices={shown.slots.map((s) => ({
                                    value: s.startAt,
                                    label: (
                                        <>
                                            {formatTime(s.startAt, tz)}
                                            <small className="text-[11px] font-medium opacity-75">
                                                to {formatTime(s.endAt, tz)}
                                            </small>
                                        </>
                                    ),
                                    ariaLabel: `${formatTime(s.startAt, tz)} to ${formatTime(s.endAt, tz)}`,
                                }))}
                                value={time}
                                onChange={(t) => {
                                    setTime(t);
                                    setTaken(null);
                                }}
                            />
                        )}
                    </section>
                ) : null}
            </StepBody>
            <StepFoot>
                <Button
                    type="button"
                    variant="ghost"
                    className="hidden gap-2 min-[760px]:inline-flex"
                    onClick={onBack}
                >
                    Back
                </Button>
                <span aria-hidden className="hidden flex-1 min-[760px]:block" />
                <Button
                    type="button"
                    className={cn(QL_BTN, "w-full gap-2 min-[760px]:w-auto")}
                    disabled={!time || busy}
                    onClick={() => void book()}
                >
                    {busy ? (
                        "Booking…"
                    ) : time && day ? (
                        <>
                            <CalendarDays aria-hidden className="size-[18px]" />
                            Book {dayWords} at {formatTime(time, tz)}
                        </>
                    ) : day ? (
                        "Pick a time"
                    ) : (
                        "Pick a day"
                    )}
                </Button>
            </StepFoot>
        </>
    );
}
