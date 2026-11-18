"use client";

import type { LookId } from "@saroh/block-contract";
import { ctaHref } from "@saroh/block-contract";

import { useBrowserNow } from "../lib/browser-now";
import type { Weekday } from "../lib/opening-hours";
import { openState, openStateText, weekdayIn } from "../lib/opening-hours";
import { phoneText } from "../lib/phone";
import type { PublicVisit } from "../lib/public-visit";
import { cn } from "../lib/utils";
import { LiveFact } from "../live/live-fact";
import type { LiveRead } from "../live/use-live-read";
import { LookIcon } from "../look-icons";
import { ctaClasses } from "./cta";
import { hoursRows } from "./hours";
import { FRONT_TYPE, FRONT_WRAP, frontButton } from "./look-front";

/**
 * Visit us's `map` layout (BLOCK-MAP §3 block 17, board LCVisit "With
 * map"): the place's facts on a wide band, for a shop people walk to. Open
 * now, the address, the owner's extra line, Directions and Call, and the
 * week with a Today badge.
 *
 * NO MAP YET. A map picture from the address needs a map provider, and
 * the block has no photo of the shop, so the band draws as "map off": the
 * address leads and the layout closes up. Directions opens the visitor's
 * own maps app. With no address (nowhere to visit) the band keeps the
 * ways to talk: Call and the extra line.
 *
 * TODAY IS THE BROWSER'S (R18): the cached page carries the whole week
 * with no day marked and no Open now; both arrive once the browser has
 * read its clock, on the business's wall clock.
 */

const noPage = () => undefined;

const LONG_DAY: Record<Weekday, string> = {
    MON: "Monday",
    TUE: "Tuesday",
    WED: "Wednesday",
    THU: "Thursday",
    FRI: "Friday",
    SAT: "Saturday",
    SUN: "Sunday",
};

/** Today's weekday on the business's clock, once the browser has read it. */
export function useBrowserWeekday(
    timeZone: string,
    pinned?: Date,
): Weekday | null {
    const now = useBrowserNow(pinned);
    if (now === null) return null;
    try {
        return weekdayIn(new Date(now), timeZone);
    } catch {
        return null;
    }
}

export function VisitUsMap({
    look,
    title,
    address,
    extraLine,
    week,
    timeZone,
    now,
    closedDates,
    phone,
    directions,
}: {
    /** Absent: Classic. */
    look?: LookId;
    title: string;
    address: string | null;
    extraLine: string | null;
    week: PublicVisit["hours"];
    timeZone: string;
    now?: Date;
    closedDates: readonly string[];
    phone: string | null;
    directions: string | null;
}) {
    const today = useBrowserWeekday(timeZone, now);
    const rows = hoursRows(week, true);
    const button = (kind: "fill" | "outline") =>
        look
            ? frontButton(look, "outline")
            : ctaClasses(kind === "fill" ? "primary" : "secondary");
    return (
        <section
            data-visit-map=""
            data-site-look-visit={look}
            className={cn(
                "text-site-fg w-full py-[var(--site-section-padding)]",
                !look &&
                    "mx-auto max-w-screen-xl px-5 sm:px-[var(--site-page-margin)]",
            )}
        >
            <div className={look ? FRONT_WRAP : undefined}>
                <div
                    className={cn(
                        "grid gap-8 p-6 min-[700px]:p-8",
                        rows && "min-[1000px]:grid-cols-2 min-[1000px]:gap-14",
                        look === "live"
                            ? "bg-site-surface rounded-site-photo"
                            : "border-site-border bg-site-bg rounded-[calc(var(--site-radius)*1.4)] border",
                    )}
                >
                    <div className="grid min-w-0 content-start gap-4">
                        <h2
                            data-site-title=""
                            className={
                                look
                                    ? FRONT_TYPE[look].h2
                                    : "font-site-heading text-[calc(1.875rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
                            }
                        >
                            {title}
                        </h2>
                        {week ? (
                            <OpenLine
                                week={week}
                                timeZone={timeZone}
                                now={now}
                                closedDates={closedDates}
                                todayHours={null}
                            />
                        ) : null}
                        {address ? (
                            <p
                                data-visit-address=""
                                className="font-site-heading whitespace-pre-line text-[calc(1.375rem*var(--site-heading-scale))] leading-snug [overflow-wrap:anywhere]"
                            >
                                {address}
                            </p>
                        ) : null}
                        {extraLine ? (
                            <p
                                data-visit-extra=""
                                className="text-site-body text-[15px] leading-relaxed"
                            >
                                {extraLine}
                            </p>
                        ) : null}
                        {directions || phone ? (
                            <div className="flex flex-wrap gap-3 pt-1">
                                {directions ? (
                                    <a
                                        href={directions}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={button("fill")}
                                    >
                                        {look ? (
                                            <LookIcon
                                                name="pin"
                                                look={look}
                                                size={18}
                                            />
                                        ) : null}
                                        Directions
                                    </a>
                                ) : null}
                                {phone ? (
                                    <a
                                        href={ctaHref(
                                            { kind: "call", number: phone },
                                            noPage,
                                        )}
                                        className={button("outline")}
                                    >
                                        {look ? (
                                            <LookIcon
                                                name="call"
                                                look={look}
                                                size={18}
                                            />
                                        ) : null}
                                        Call {phoneText(phone)}
                                    </a>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                    {rows ? (
                        <dl
                            data-visit-hours=""
                            className="border-site-border grid content-start border-t text-[15px] tabular-nums"
                        >
                            {rows.map((row) => {
                                const on = row.day === today;
                                return (
                                    <div
                                        key={row.day}
                                        className="border-site-border flex min-h-[46px] items-center justify-between gap-4 border-b"
                                    >
                                        <dt
                                            className={cn(
                                                "inline-flex items-center gap-2",
                                                on
                                                    ? "text-site-fg font-semibold"
                                                    : "text-site-body",
                                            )}
                                        >
                                            {LONG_DAY[row.day]}
                                            {on ? (
                                                <span
                                                    data-visit-today=""
                                                    className="bg-site-accent text-site-accent-fg rounded-full px-2 py-0.5 text-[12px] font-semibold"
                                                >
                                                    Today
                                                </span>
                                            ) : null}
                                        </dt>
                                        <dd
                                            className={
                                                on
                                                    ? "text-site-fg font-semibold"
                                                    : row.hours
                                                      ? "text-site-body"
                                                      : "text-site-muted"
                                            }
                                        >
                                            {row.hours ?? "Closed"}
                                        </dd>
                                    </div>
                                );
                            })}
                        </dl>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

/**
 * "Open now · closes 9 pm", as a live fact (U8's `LiveFact`): a box of a
 * fixed height from the first paint, worked out in the browser from the
 * place's hours on the business's clock and again each minute, so it is
 * never left saying Open after closing, and never in the cached page
 * (R18). When it can't be said (no hours for today), the line says
 * today's hours instead, never a guess (VD07).
 */
export function OpenLine({
    week,
    timeZone,
    now: fixed,
    closedDates,
    todayHours,
}: {
    week: PublicVisit["hours"];
    timeZone: string;
    now?: Date;
    closedDates: readonly string[];
    todayHours: string | null;
}) {
    const now = useBrowserNow(fixed);
    const read: LiveRead<Date> =
        now === null
            ? { status: "loading" }
            : { status: "fresh", data: new Date(now), fetchedAt: now };
    return (
        <LiveFact
            read={read}
            reserve="min-h-[26px]"
            className="text-site-fg flex items-center gap-2 text-[15px] font-semibold"
            pick={(moment) => {
                const state = week
                    ? openState(week, moment, timeZone, closedDates)
                    : null;
                return state
                    ? { text: openStateText(state), open: state.open }
                    : null;
            }}
            fresh={(value) => (
                <span
                    data-visit-open=""
                    className="inline-flex items-center gap-2"
                >
                    <span
                        aria-hidden="true"
                        className={cn(
                            "inline-block size-2 rounded-full",
                            value.open ? "bg-site-accent" : "bg-site-muted",
                        )}
                    />
                    {value.text}
                </span>
            )}
            fallback={
                todayHours ? <span data-visit-open="">{todayHours}</span> : null
            }
        />
    );
}
