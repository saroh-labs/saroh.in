"use client";

import type { RenderedHours } from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import type { OpeningHoursDay, Weekday } from "../lib/opening-hours";
import { clockText, openState, openStateText } from "../lib/opening-hours";
import type { PublicVisit } from "../lib/public-visit";
import { usePublicVisit } from "../lib/use-public-visit";
import { cn } from "../lib/utils";

/**
 * `hours` v1 — the week's opening hours on their own, read live (industry
 * templates U2): a table of the seven days, today marked and "Open now ·
 * closes 3pm" above it, as the bakery and clinic designs list them.
 *
 * The same public visit read, and the same rule for "Open now", as Visit
 * us (`use-public-visit.ts`, `opening-hours.ts`): with a `storeId`, that
 * shop; without one, the business's own place.
 *
 * - closed days are listed, muted but STATED ("Closed"), unless the
 *   merchant turned `showClosed` off;
 * - no hours saved, the place gone or closed, or a live render that could
 *   not tell its site: the block renders NOTHING — never seven "Closed"
 *   rows, a claim the business never made;
 * - the read fails: the block's own error state, with a retry;
 * - `siteId` undefined (the editor's canvas): it says where the hours come
 *   from; `visit` given (catalog, tests): drawn without a fetch.
 *
 * Drawn from `--site-*` only; gates G2 and G7 fail the build otherwise.
 */

/** What the section is called when the merchant left the title empty. */
export const HOURS_TITLE = "Opening hours";

const WEEK: readonly Weekday[] = [
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
    "SUN",
];

const DAY_NAMES: Record<Weekday, string> = {
    MON: "Monday",
    TUE: "Tuesday",
    WED: "Wednesday",
    THU: "Thursday",
    FRI: "Friday",
    SAT: "Saturday",
    SUN: "Sunday",
};

function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/** Today's weekday on the business's wall clock. */
function weekdayIn(now: Date, timeZone: string): Weekday | null {
    try {
        const short = new Intl.DateTimeFormat("en-US", {
            timeZone,
            weekday: "short",
        }).format(now);
        const day = short.slice(0, 3).toUpperCase();
        return (WEEK as readonly string[]).includes(day)
            ? (day as Weekday)
            : null;
    } catch {
        return null;
    }
}

/** The week's rows in order, Monday first; null when no day opens. */
export function hoursRows(
    week: readonly OpeningHoursDay[] | null | undefined,
    showClosed: boolean,
): { day: Weekday; hours: string | null }[] | null {
    if (!week || week.length === 0) return null;
    if (!week.some((d) => !d.closed)) return null;
    const rows: { day: Weekday; hours: string | null }[] = [];
    for (const day of WEEK) {
        const d = week.find((entry) => entry.day === day);
        const open = d && !d.closed;
        if (!open && !showClosed) continue;
        rows.push({
            day,
            hours: open ? `${clockText(d.open)} – ${clockText(d.close)}` : null,
        });
    }
    return rows;
}

export default function HoursSection({
    content,
    siteId,
    apiUrl = DEFAULT_API_URL,
    visit,
    now,
}: {
    content: RenderedHours;
    siteId?: string | null;
    apiUrl?: string;
    /** A sample place to draw instead of fetching (catalog, tests). */
    visit?: PublicVisit;
    /** The moment today and "Open now" are worked out for. Tests pin it. */
    now?: Date;
}) {
    const { state, retry } = usePublicVisit({
        siteId,
        storeId: said(content.storeId),
        apiUrl,
        given: visit,
    });
    const title = said(content.title) ?? HOURS_TITLE;

    if (state.kind === "idle") {
        return (
            <Frame title={title}>
                <Note>
                    Your opening hours from Settings › Hours show here on your
                    live site, with whether you&apos;re open now.
                </Note>
            </Frame>
        );
    }
    if (state.kind === "loading") {
        return (
            <Frame title={title}>
                <Note busy>Loading our opening hours…</Note>
            </Frame>
        );
    }
    if (state.kind === "error") {
        return (
            <Frame title={title}>
                <Note
                    action={
                        <button
                            type="button"
                            onClick={retry}
                            className="text-site-accent focus-visible:ring-site-accent cursor-pointer rounded-[var(--site-radius)] text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2"
                        >
                            Try again
                        </button>
                    }
                >
                    We couldn&apos;t load our opening hours right now.
                </Note>
            </Frame>
        );
    }

    const place = state.visit;
    if (!place) return null;
    const rows = hoursRows(place.hours, content.showClosed !== false);
    if (!rows) return null;
    const at = now ?? new Date();
    const today = weekdayIn(at, place.timezone);
    const status = openState(
        place.hours,
        at,
        place.timezone,
        place.closedDates,
    );

    return (
        <Frame title={title}>
            {status ? (
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <span
                        aria-hidden="true"
                        className={cn(
                            "inline-block size-2 rounded-full",
                            status.open ? "bg-site-accent" : "bg-site-muted",
                        )}
                    />
                    {openStateText(status)}
                </p>
            ) : null}
            <table className="w-full max-w-md border-collapse text-left text-[15px]">
                <caption className="sr-only">{title}</caption>
                <tbody>
                    {rows.map((row) => {
                        const isToday = row.day === today;
                        return (
                            <tr
                                key={row.day}
                                aria-current={isToday ? "date" : undefined}
                                className="border-site-border border-b last:border-b-0"
                            >
                                <th
                                    scope="row"
                                    className={cn(
                                        "py-2 pr-6 font-semibold",
                                        row.hours === null && "text-site-muted",
                                    )}
                                >
                                    {DAY_NAMES[row.day]}
                                    {isToday ? (
                                        <span className="text-site-muted ml-2 text-[12.5px] font-normal">
                                            Today
                                        </span>
                                    ) : null}
                                </th>
                                <td
                                    className={cn(
                                        "py-2 text-right tabular-nums",
                                        row.hours === null && "text-site-muted",
                                    )}
                                >
                                    {row.hours ?? "Closed"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </Frame>
    );
}

function Frame({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="text-site-fg mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <h2 className="font-site-heading mb-3 text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]">
                {title}
            </h2>
            {children}
        </section>
    );
}

function Note({
    busy = false,
    action,
    children,
}: {
    busy?: boolean;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div
            role={action ? "alert" : "status"}
            aria-busy={busy || undefined}
            className="border-site-border text-site-body grid max-w-md justify-items-start gap-2 rounded-[calc(var(--site-radius)*1.4)] border border-dashed p-5 text-sm leading-relaxed"
        >
            <p>{children}</p>
            {action ?? null}
        </div>
    );
}
