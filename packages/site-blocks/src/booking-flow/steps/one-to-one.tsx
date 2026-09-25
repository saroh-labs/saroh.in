import { cn } from "../../lib/utils";
import type {
    BookingDay,
    BookingDays,
    BookingService,
    BookingStart,
} from "../model";
import {
    dateText,
    dayAria,
    dayCountLabel,
    dayHeading,
    dayParts,
    groupStarts,
    timeIn,
} from "../model";
import { focusRing, quietFill } from "../styles";

export function OneToOne({
    days,
    day,
    zone,
    phone,
    service,
    chosen,
    onDay,
    onStart,
    business,
}: {
    days: BookingDays;
    day: BookingDay | null;
    zone: string;
    phone: boolean;
    service: BookingService;
    chosen: BookingStart | null;
    onDay: (date: string) => void;
    onStart: (start: BookingStart) => void;
    business: string;
}) {
    const list = days.days;
    const firstDay = list.at(0);
    const lastDay = list.at(-1);
    const count = day?.starts.length ?? 0;
    const onlyOne = service.staff.length === 1 ? service.staff[0] : null;
    return (
        <>
            <div className="mb-2 flex items-baseline gap-2">
                <span className="text-site-fg text-[13px] font-semibold">
                    Next two weeks
                </span>
                {firstDay && lastDay ? (
                    <span className="text-site-muted text-[12.5px]">
                        {dateText(firstDay.date)} – {dateText(lastDay.date)}
                    </span>
                ) : null}
            </div>
            <div
                role="radiogroup"
                aria-label="Day"
                className="grid grid-cols-7 gap-1.5"
            >
                {list.map((d) => {
                    const on = d.date === day?.date;
                    const free = d.starts.length > 0;
                    const { dow, n } = dayParts(d.date);
                    return (
                        <button
                            key={d.date}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            aria-label={dayAria(d)}
                            disabled={!free}
                            onClick={() => onDay(d.date)}
                            className={cn(
                                "min-w-0 border text-center transition-colors duration-100 ease-out",
                                focusRing,
                                phone
                                    ? "rounded-[calc(var(--site-radius)+10px)] py-2"
                                    : "rounded-[calc(var(--site-radius)+12px)] px-0.5 py-[9px]",
                                on
                                    ? "border-site-fg bg-site-fg text-site-bg cursor-pointer"
                                    : free
                                      ? "border-site-border bg-site-surface text-site-fg cursor-pointer"
                                      : cn(
                                            "border-site-border text-site-muted cursor-not-allowed",
                                            quietFill,
                                        ),
                            )}
                        >
                            <span className="block text-xs">{dow}</span>
                            <span className="mt-0.5 block text-[17px] font-bold">
                                {n}
                            </span>
                            <span className="mt-0.5 block text-[11px]">
                                {dayCountLabel(d, phone)}
                            </span>
                        </button>
                    );
                })}
            </div>
            {!day ? (
                <p className="text-site-body mt-3 text-sm">
                    Nothing free in the next two weeks. Get in touch with{" "}
                    {business} and they&apos;ll fit you in.
                </p>
            ) : (
                <div className="border-site-border mt-[18px] border-t pt-4">
                    <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="font-display text-site-fg text-base font-semibold tracking-[-0.01em]">
                            {dayHeading(day.date)}
                        </h3>
                        <span className="text-site-muted text-[12.5px]">
                            {count} {count === 1 ? "time" : "times"} free
                            {onlyOne ? ` with ${onlyOne}` : ""}
                        </span>
                    </div>
                    <div className="mt-3 grid gap-3.5">
                        {groupStarts(day.starts, zone).map((g) => (
                            <div
                                key={g.label}
                                role="radiogroup"
                                aria-label={g.label}
                                className="flex flex-wrap items-baseline gap-x-2.5 gap-y-2"
                            >
                                <span className="text-site-muted flex-[0_0_84px] text-[12.5px] font-semibold">
                                    {g.label}
                                </span>
                                <div className="grid min-w-0 flex-[1_1_240px] grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-2">
                                    {g.starts.map((s) => {
                                        const on =
                                            chosen?.startAt === s.startAt;
                                        const t = timeIn(s.startAt, zone);
                                        return (
                                            <button
                                                key={s.startAt}
                                                type="button"
                                                role="radio"
                                                aria-checked={on}
                                                aria-label={
                                                    s.staffName
                                                        ? `${t} with ${s.staffName}`
                                                        : t
                                                }
                                                onClick={() => onStart(s)}
                                                className={cn(
                                                    "h-[45px] cursor-pointer rounded-[calc(var(--site-radius)+7px)] border text-[15px] font-semibold tabular-nums transition-colors duration-100 ease-out",
                                                    focusRing,
                                                    on
                                                        ? "border-site-fg bg-site-fg text-site-bg"
                                                        : "border-site-border bg-site-surface text-site-fg",
                                                )}
                                            >
                                                {t}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {service.staff.length > 1 ? (
                <p className="text-site-muted mt-2.5 text-[12.5px]">
                    Times are with whoever is free — you&apos;ll see who before
                    you confirm.
                </p>
            ) : null}
        </>
    );
}
