/**
 * A day, as saroh.in writes it (DEC-195, B4): "17 Oct 2026", "Tue 5 Mar",
 * "Tuesday 5 March". The one place a date is formatted (`pnpm check:formats`).
 */
export function formatDay(
    isoDay: string,
    {
        weekday,
        month,
        year = false,
    }: {
        weekday?: "short" | "long";
        month: "short" | "long";
        year?: boolean;
    },
): string {
    return new Intl.DateTimeFormat("en-GB", {
        weekday,
        day: "numeric",
        month,
        year: year ? "numeric" : undefined,
        timeZone: "Asia/Kolkata",
    })
        .format(dayOf(isoDay))
        .replace(",", "");
}

/** Noon in India on that day, so no time zone moves it to another date. */
function dayOf(isoDay: string): Date {
    return new Date(`${isoDay}T12:00:00+05:30`);
}

/** "7:42 pm", India time. */
export function formatTime(at: Date): string {
    return at
        .toLocaleTimeString("en-IN", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Kolkata",
        })
        .replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toLowerCase()}`);
}
