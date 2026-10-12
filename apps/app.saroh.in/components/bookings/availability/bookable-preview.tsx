"use client";

import { EmptyState, LoadingState } from "@saroh/ui/data-state";
import { OptionSelect } from "@saroh/ui/option-select";
import { useEffect, useId, useState } from "react";

import { FailedRead } from "@/components/shared/failed-read";
import { formatClock, formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import type { LocalDate } from "@/lib/services/diary";
import { localMinuteOf } from "@/lib/services/diary";
import { readOffered } from "@/lib/staff/actions";
import { pickOfferedDay } from "@/lib/staff/offered";
import type { OfferedRead } from "@/lib/staff/types";

const card = "rounded-[12px] border border-border bg-card px-4 py-[13px]";
const cardTitle = "font-display text-[15px] font-semibold tracking-[-0.02em]";

/**
 * "What customers see" on Availability: for a service this person takes
 * and a day the owner picks (today, or the next day with a time), the
 * times the booking page offers. It asks the booking page's own read
 * (`readOffered`), so it shows saved hours, less bookings, time off, the
 * gap after each and the booking rules, exactly as a customer gets them.
 * Unsaved changes aren't in it yet, and it says so.
 */
export function BookablePreview({
    person,
    services,
    today,
    timezone,
    stamp,
    dirty,
}: {
    person: { id: string; name: string };
    /** The services they take that the booking page offers. */
    services: { id: string; name: string }[];
    today: LocalDate;
    timezone: string;
    /** Changes whenever what is saved does, so the times are read again. */
    stamp: string;
    /** The page has changes waiting for Save. */
    dirty: boolean;
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
    const key = `${serviceId ?? ""}|${person.id}|${stamp}|${again}`;

    useEffect(() => {
        if (!serviceId) return;
        let live = true;
        void readOffered(serviceId, person.id)
            .catch((): OfferedRead => ({ ok: false, why: "failed" }))
            .then((read) => {
                if (live) setLoaded({ key, read });
            });
        return () => {
            live = false;
        };
    }, [serviceId, person.id, key]);

    const head = (
        <>
            <h2 id={`${id}-title`} className={cardTitle}>
                What customers see
            </h2>
            <p
                data-ph-mask=""
                className="mb-2.5 mt-0.5 text-[11.5px] text-muted-foreground"
            >
                The times your booking page offers with {person.name}.
            </p>
        </>
    );

    if (!service) {
        return (
            <section aria-labelledby={`${id}-title`} className={card}>
                {head}
                <EmptyState
                    data-ph-mask=""
                    size="inline"
                    title={`${person.name} takes no service on the booking page`}
                    description="Customers aren't offered these hours until a service on the booking page is theirs. Choose who takes each one in Services."
                />
            </section>
        );
    }

    const read = loaded?.key === key ? loaded.read : null;
    const days = read?.ok ? read.data.days : [];
    const day = read?.ok ? pickOfferedDay(days, picked, today) : null;

    return (
        <section aria-labelledby={`${id}-title`} className={card}>
            {head}
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
                                className="inline-flex h-[30px] items-center rounded-full border border-border px-[11px] text-[12.5px] font-medium tabular-nums"
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
            {dirty ? (
                <p className="mt-2.5 text-[11.5px] text-muted-foreground">
                    This shows what is saved. Save to see your changes here.
                </p>
            ) : null}
        </section>
    );
}
