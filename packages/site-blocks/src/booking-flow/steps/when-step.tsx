import { destructiveAlertClasses } from "../../alert";
import { cn } from "../../lib/utils";
import type { DaysState } from "../flow-state";
import type {
    BookingDay,
    BookingDays,
    BookingService,
    BookingStart,
} from "../model";
import { card, focusRing, quietFill } from "../styles";
import { OneToOne } from "./one-to-one";
import { Sessions } from "./sessions";
import { StepHead } from "./step-head";

/** Step 2: when — a day and a start, or a class session. */
export function WhenStep({
    daysState,
    days,
    isClass,
    day,
    sessions,
    more,
    zone,
    phone,
    service,
    chosen,
    business,
    onRetry,
    onDay,
    onStart,
    onMore,
}: {
    daysState: DaysState;
    days: BookingDays | null;
    isClass: boolean;
    day: BookingDay | null;
    /** The class sessions shown so far. */
    sessions: BookingStart[];
    more: boolean;
    zone: string;
    phone: boolean;
    service: BookingService;
    chosen: BookingStart | null;
    business: string;
    onRetry: () => void;
    onDay: (date: string) => void;
    onStart: (start: BookingStart) => void;
    onMore: () => void;
}) {
    return (
        <div className={card}>
            <StepHead n={2} title="When?" />
            {daysState.kind === "loading" ? (
                <div
                    role="status"
                    aria-label="Loading times"
                    className="grid gap-2.5"
                >
                    <div className={cn("h-3.5 w-2/5 rounded-md", quietFill)} />
                    <div
                        className={cn(
                            "h-[66px] rounded-[calc(var(--site-radius)+12px)]",
                            quietFill,
                        )}
                    />
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
                            className={cn(
                                "text-site-fg mt-3 text-sm font-semibold underline",
                                focusRing,
                            )}
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
                    phone={phone}
                    service={service}
                    chosen={chosen}
                    onDay={onDay}
                    onStart={onStart}
                    business={business}
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
                />
            ) : null}
        </div>
    );
}
