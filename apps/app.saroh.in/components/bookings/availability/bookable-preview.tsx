"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState, LoadingState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { OptionSelect } from "@saroh/ui/option-select";
import { TextLink } from "@saroh/ui/text-link";
import { useEffect, useId, useState } from "react";

import { FailedRead } from "@/components/shared/failed-read";
import { formatClock, formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import type { LocalDate } from "@/lib/services/diary";
import { localMinuteOf } from "@/lib/services/diary";
import { readOffered } from "@/lib/staff/actions";
import { pickOfferedDay } from "@/lib/staff/offered";
import type { OfferedRead } from "@/lib/staff/types";

/**
 * "What customers see" on Hours and time off (U17, More › What customers
 * see): for a service this person takes and a day the owner picks (today,
 * or the next day with a time), the times the booking page offers. It asks
 * the booking page's own read (`readOffered`), so it shows saved hours,
 * less bookings, time off, the gap after each and the booking rules,
 * exactly as a customer gets them. Every change saves as it is made, so
 * it is always up to date. With everyone shown it reads the business's
 * times for the service, whoever takes it. Under the times, "Why isn't a
 * time offered?" (`onWhy`).
 */
export function BookablePreview({
    person,
    services,
    today,
    timezone,
    stamp,
    onWhy,
}: {
    /** Whose times; null for everyone's. */
    person: { id: string; name: string } | null;
    /** The services they take that the booking page offers. */
    services: { id: string; name: string }[];
    today: LocalDate;
    timezone: string;
    /** Changes whenever what is saved does, so the times are read again. */
    stamp: string;
    onWhy: () => void;
}) {
    const id = useId();
    const [chosen, setChosen] = useState<string | null>(null);
    const service = services.find((s) => s.id === chosen) ?? services.at(0);
    const serviceId = service?.id ?? null;
    // The day picked by hand, or null for the first day with a time.
    const [picked, setPicked] = useState<LocalDate | null>(null);
    // Held with what it was read for, so "still loading" is derived, not
    // set: a reset inside the effect would draw twice on every change.
    const [loaded, setLoaded] = useState<{
        key: string;
        read: OfferedRead;
    } | null>(null);
    const [again, setAgain] = useState(0);
    const personId = person?.id;
    const key = `${serviceId ?? ""}|${personId ?? ""}|${stamp}|${again}`;

    useEffect(() => {
        if (!serviceId) return;
        let live = true;
        void readOffered(serviceId, personId)
            .catch((): OfferedRead => ({ ok: false, why: "failed" }))
            .then((read) => {
                if (live) setLoaded({ key, read });
            });
        return () => {
            live = false;
        };
    }, [serviceId, personId, key]);

    const why = (
        <Button
            type="button"
            variant="link"
            size="inline"
            onClick={onWhy}
            className="mt-1.5 min-h-11 text-[13.5px] font-semibold text-foreground underline decoration-border-strong"
        >
            Why isn&apos;t a time offered?
        </Button>
    );

    if (!service) {
        return (
            <div id={id}>
                <EmptyState
                    data-ph-mask=""
                    size="inline"
                    title={
                        person
                            ? `${person.name} takes no service on the booking page`
                            : "No service is on the booking page"
                    }
                    description="Customers aren't offered these hours until a service on the booking page is theirs. Choose who does each one in Services."
                />
                {why}
            </div>
        );
    }

    const read = loaded?.key === key ? loaded.read : null;
    const days = read?.ok ? read.data.days : [];
    const day = read?.ok ? pickOfferedDay(days, picked, today) : null;

    return (
        <div id={id}>
            <div className="flex flex-wrap gap-2">
                {services.length > 1 ? (
                    <OptionSelect
                        size="sm"
                        aria-label="Service"
                        value={service.id}
                        onValueChange={(v) => {
                            setChosen(v);
                            setPicked(null);
                        }}
                        className="min-w-0 flex-[1_1_9rem]"
                        options={services.map((s) => ({
                            value: s.id,
                            label: s.name,
                        }))}
                    />
                ) : (
                    <p
                        data-ph-mask=""
                        className="basis-full text-[12.5px] font-semibold"
                    >
                        {service.name}
                    </p>
                )}
                {day ? (
                    <OptionSelect
                        size="sm"
                        aria-label="Day"
                        value={day.date}
                        onValueChange={setPicked}
                        className="min-w-0 flex-[1_1_9rem]"
                        options={days.map((d) => ({
                            value: d.date,
                            label: formatDay(d.date, {
                                weekday: "short",
                                year: "never",
                                relative: true,
                                today,
                            }),
                            hint: d.starts.length
                                ? count(d.starts.length, "time", "times")
                                : d.closed
                                  ? "Closed"
                                  : "No times",
                        }))}
                    />
                ) : null}
            </div>
            <div className="mt-2.5" aria-live="polite">
                {!read ? (
                    <LoadingState rows={2} label="Loading the times" />
                ) : !read.ok ? (
                    read.why === "off" ? (
                        <EmptyState
                            data-ph-mask=""
                            size="inline"
                            title="Not on the booking page right now"
                            description={`${service.name} isn't offered there, so customers see no times for it.`}
                        />
                    ) : (
                        <FailedRead
                            things="the times"
                            reassurance="Your hours are as you left them."
                            onRetry={() => setAgain((n) => n + 1)}
                        />
                    )
                ) : !day || day.starts.length === 0 ? (
                    <EmptyState
                        size="inline"
                        title={
                            day?.closed
                                ? "Closed that day"
                                : "No times that day"
                        }
                        description={
                            day?.closed
                                ? "The business is closed, so nothing is offered."
                                : "Nothing is free inside the hours and booking rules."
                        }
                    />
                ) : (
                    <ul
                        aria-label={`Times offered on ${formatDay(day.date, { weekday: "long", year: "never", today })}`}
                        className="flex flex-wrap gap-1.5"
                    >
                        {day.starts.map((s) => (
                            <li
                                key={s.startAt}
                                className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3 text-[13px] tabular-nums"
                            >
                                {formatClock(
                                    localMinuteOf(s.startAt, timezone),
                                )}
                                {/* A class lists every session, full or not. */}
                                {s.placesLeft === null ? null : (
                                    <span className="ml-1.5 font-normal text-muted-foreground">
                                        {s.placesLeft === 0
                                            ? "full"
                                            : `${s.placesLeft} left`}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {why}
        </div>
    );
}

/** Settings › Hours, where the business's opening hours are kept. */
const OPENING_HOURS = "/settings/organization?section=hours";

/**
 * "Why isn't a time offered?" (U17): the five things a time needs to be on
 * the booking page, one to a line, with the way to the opening hours —
 * where the old page's note about in-person hours now lives.
 */
export function WhyNotOffered({ who }: { who: string }) {
    const steps = [
        <>
            It&apos;s inside {who}&apos;s weekly hours or extra hours, and not
            in time off.
        </>,
        <>
            The business is open then, for in-person visits.{" "}
            <TextLink href={OPENING_HOURS} className="font-semibold">
                Opening hours
            </TextLink>{" "}
            are in Settings.
        </>,
        <>It&apos;s inside the service&apos;s own hours, if it has some.</>,
        <>
            Nobody has booked it, and the break after the last visit has passed.
        </>,
        <>It&apos;s not too soon or too far ahead (see Booking rules).</>,
    ];
    return (
        <div>
            <p className="text-[14px] leading-[1.55]">
                A time shows on your booking page only when all of these are
                true:
            </p>
            <ol>
                {steps.map((step, i) => (
                    <li
                        // The steps never change order.
                        key={i}
                        className={cn(
                            "flex min-h-14 items-center gap-2.5 py-2 text-[14px]",
                            i > 0 && "border-t border-border",
                        )}
                    >
                        <b className="w-6 shrink-0">{i + 1}</b>
                        <span className="flex-1">{step}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}
