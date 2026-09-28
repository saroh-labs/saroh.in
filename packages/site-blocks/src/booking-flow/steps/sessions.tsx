import { cn } from "../../lib/utils";
import type { BookingStart } from "../model";
import { dateIn, dateText, dayParts, placesText, timeIn } from "../model";
import { focusRing, optionClasses, quietFill } from "../styles";
import type { WaitlistPlace } from "../waitlist";
import { fullSessionText } from "../waitlist";

export function Sessions({
    sessions,
    more,
    onMore,
    zone,
    duration,
    chosen,
    onPick,
    waitlist,
}: {
    sessions: BookingStart[];
    more: boolean;
    onMore: () => void;
    zone: string;
    duration: number;
    chosen: BookingStart | null;
    onPick: (start: BookingStart) => void;
    /**
     * A full class's waitlist (A12): a full session can be chosen, to join
     * its line, and says "Full — join waitlist", their place in line, or
     * that a place is held for them. Absent: a full session is closed.
     */
    waitlist?: { placeOf: (startAt: string) => WaitlistPlace | undefined };
}) {
    if (sessions.length === 0) {
        return (
            <p className="text-site-body text-sm">
                No classes in the next two weeks.
            </p>
        );
    }
    return (
        <div role="radiogroup" aria-label="Class" className="grid gap-2">
            {sessions.map((s) => {
                const on = chosen?.startAt === s.startAt;
                const left = s.placesLeft ?? 0;
                const full = left <= 0;
                const closed = full && !waitlist;
                const place = full ? waitlist?.placeOf(s.startAt) : undefined;
                const date = dateIn(s.startAt, zone);
                const { dow, n } = dayParts(date);
                const end = timeIn(
                    new Date(
                        new Date(s.startAt).getTime() + duration * 60_000,
                    ).toISOString(),
                    zone,
                );
                return (
                    <button
                        key={s.startAt}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={closed}
                        onClick={() => onPick(s)}
                        className={cn(
                            optionClasses(on),
                            closed && "cursor-not-allowed opacity-70",
                        )}
                    >
                        <span
                            className={cn(
                                "w-[50px] flex-none rounded-[calc(var(--site-radius)+10px)] py-1.5 text-center",
                                quietFill,
                            )}
                        >
                            <span className="text-site-muted block text-[11.5px] font-semibold uppercase tracking-[0.06em]">
                                {dow}
                            </span>
                            <span className="font-site-heading block text-xl font-semibold leading-[1.1]">
                                {n}
                            </span>
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold">
                                {timeIn(s.startAt, zone)} – {end} ·{" "}
                                {dateText(date)}
                            </span>
                            {s.staffName ? (
                                <span className="text-site-body mt-0.5 block text-[13px]">
                                    With {s.staffName}
                                </span>
                            ) : null}
                        </span>
                        <span
                            className={cn(
                                "whitespace-nowrap text-[13px] font-semibold",
                                place?.status === "OFFERED"
                                    ? "text-site-fg"
                                    : full
                                      ? "text-site-muted"
                                      : left <= 3
                                        ? "text-site-fg"
                                        : "text-site-body",
                            )}
                        >
                            {full && waitlist
                                ? fullSessionText(place, zone)
                                : placesText(left)}
                        </span>
                    </button>
                );
            })}
            {more ? (
                <button
                    type="button"
                    onClick={onMore}
                    className={cn(
                        "text-site-fg justify-self-start text-sm font-semibold underline",
                        focusRing,
                    )}
                >
                    Show more classes
                </button>
            ) : null}
        </div>
    );
}
