import { cn } from "../cn";
import { clockLabel, hourLabel } from "./time";

/**
 * A time in the redesign's one form (KIT.md): JetBrains Mono, 12-hour,
 * "9:14 am", or "9 am" for an hour label. `at` is "HH:MM" (24-hour), which
 * the `<time>` element carries for machines.
 */
export function TimeStamp({
    at,
    hour = false,
    className,
}: {
    at: string;
    /** Draw the hour label ("9 am"), not the minute ("9:00 am"). */
    hour?: boolean;
    className?: string;
}) {
    return (
        <time
            dateTime={at}
            className={cn(
                "font-mono font-medium tabular-nums [font-variant-numeric:tabular-nums]",
                className,
            )}
        >
            {hour ? hourLabel(at) : clockLabel(at)}
        </time>
    );
}
