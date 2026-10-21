import { destructiveAlertClasses } from "../../alert";
import { cn } from "../../lib/utils";
import type { BusinessReach } from "../../reach-links";
import type { DaysState } from "../flow-state";
import type {
    BookingDay,
    BookingDays,
    BookingService,
    BookingStart,
} from "../model";
import { visitsOf } from "../model";
import { card, quietFill, textAction } from "../styles";
import type { WaitlistPlace } from "../waitlist";
import { OneToOne } from "./one-to-one";
import { Sessions } from "./sessions";
import { StepHead } from "./step-head";

export interface WhenProps {
    daysState: DaysState;
    days: BookingDays | null;
    isClass: boolean;
    day: BookingDay | null;
    /** The class sessions shown so far. */
    sessions: BookingStart[];
    more: boolean;
    zone: string;
    service: BookingService;
    chosen: BookingStart | null;
    business: string;
    onRetry: () => void;
    onDay: (date: string) => void;
    onStart: (start: BookingStart) => void;
    onMore: () => void;
    /**
     * A full class's waitlist (A12): full sessions can be chosen to join
     * it, and say where the customer stands. Absent: full is full.
     */
    waitlist?: { placeOf: (startAt: string) => WaitlistPlace | undefined };
    /** The person asked for ("With: Asha"); null for anyone. */
    person?: string | null;
    onPerson?: (id: string | null) => void;
    /** Days from today the two weeks on show start. */
    skip?: number;
    /** Where "Show later dates" goes; null when there is nothing later. */
    later?: number | null;
    onSkip?: (skip: number) => void;
    /** A call and a message, offered when nothing is free. */
    reach?: BusinessReach | null;
}

/** Step 2: when — a day and a start, or a class session. */
export function WhenStep(props: WhenProps) {
    return (
        <div className={card}>
            <StepHead
                n={2}
                title={
                    visitsOf(props.service) > 1
                        ? "When is your first visit?"
                        : "When?"
                }
            />
            <WhenBody {...props} />
        </div>
    );
}

/**
 * What the when step shows under its heading: the times' loading shape,
 * a read that failed, a one-to-one's days and times, or a class's
 * sessions. Classic draws it in its card (`WhenStep`); a look's frames
 * draw it under their own heading (U10).
 */
export function WhenBody({
    daysState,
    days,
    isClass,
    day,
    sessions,
    more,
    zone,
    service,
    chosen,
    business,
    onRetry,
    onDay,
    onStart,
    onMore,
    waitlist,
    person = null,
    onPerson,
    skip = 0,
    later = null,
    onSkip,
    reach = null,
}: WhenProps) {
    const weeks = { skip, later, onSkip };
    return (
        <>
            {daysState.kind === "loading" ? (
                // The shape of what is coming: the label, two weeks of
                // days, a row of times. The card holds its height while
                // the times are read, so nothing under it jumps.
                <div
                    role="status"
                    aria-label="Loading times"
                    data-times-loading=""
                    className="grid gap-2.5"
                >
                    <div className={cn("h-3.5 w-2/5 rounded-md", quietFill)} />
                    {isClass ? (
                        <div className="grid gap-2">
                            {[0, 1, 2].map((i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "h-[60px] rounded-[calc(var(--site-radius)+10px)]",
                                        quietFill,
                                    )}
                                />
                            ))}
                        </div>
                    ) : (
                        <>
                            <div className="coarse:grid-cols-[repeat(auto-fill,minmax(44px,1fr))] grid grid-cols-7 gap-1.5">
                                {Array.from({ length: 14 }, (_, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "h-[62px] rounded-[calc(var(--site-radius)+10px)]",
                                            quietFill,
                                        )}
                                    />
                                ))}
                            </div>
                            <div
                                className={cn(
                                    "mt-2 h-[45px] rounded-[calc(var(--site-radius)+7px)]",
                                    quietFill,
                                )}
                            />
                        </>
                    )}
                </div>
            ) : daysState.kind === "error" ? (
                <div>
                    <p role="alert" className={destructiveAlertClasses}>
                        {daysState.gone
                            ? "This isn't taking bookings online right now."
                            : "We couldn't load the times. Please try again."}
                    </p>
                    {daysState.gone ? null : (
                        <button
                            type="button"
                            onClick={onRetry}
                            className={cn(textAction, "mt-3")}
                        >
                            Try again
                        </button>
                    )}
                </div>
            ) : days && !isClass ? (
                <OneToOne
                    days={days}
                    day={day}
                    zone={zone}
                    staff={service.staff}
                    chosen={chosen}
                    onDay={onDay}
                    onStart={onStart}
                    business={business}
                    people={days.staff ?? []}
                    person={person}
                    onPerson={onPerson}
                    weeks={weeks}
                    reach={reach}
                />
            ) : days ? (
                <Sessions
                    sessions={sessions}
                    more={more}
                    onMore={onMore}
                    zone={zone}
                    duration={service.durationMinutes}
                    chosen={chosen}
                    onPick={onStart}
                    waitlist={waitlist}
                    weeks={weeks}
                    reach={reach}
                />
            ) : null}
        </>
    );
}
