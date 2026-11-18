"use client";

import type { LookId } from "@saroh/block-contract";
import { useSyncExternalStore } from "react";

import { DEFAULT_API_URL } from "../api-url";
import type { OpeningHoursDay, Weekday } from "../lib/opening-hours";
import { clockText, openState, weekdayIn } from "../lib/opening-hours";
import { phoneText } from "../lib/phone";
import type { PublicVisit } from "../lib/public-visit";
import { isPublicVisit } from "../lib/public-visit";
import { cn } from "../lib/utils";
import type { LiveRead } from "../live/use-live-read";
import { useLiveRead } from "../live/use-live-read";
import { LookIcon } from "../look-icons";
import { said } from "./look-front";
import { OwnerPhotoNote } from "./no-photo";
import { Stamp, townOf } from "./stamp";
import { directionsHref } from "./visit-us";

/**
 * The hero's Answer row (BLOCK-MAP §3, the LA Hero board), a switch on
 * every hero layout: "Open now · until 8 pm", Directions and Call, read
 * from the business's hours, address and phone (the public visit read,
 * G8, the same one Visit us reads).
 *
 * TODAY IS WORKED OUT IN THE BROWSER (R18): the cached page carries none
 * of it, not even the address, so no copy of the page ever says "Open now"
 * on a day it is shut. The row keeps its height (44px) from the first
 * paint. A read that fails, or a business with no hours, address or phone,
 * draws nothing in it: never "Closed" for a week nobody saved.
 *
 * The open words change while the page is open (the read polls), so they
 * are a polite live region, never an assertive one.
 */

/** The public visit read's address, or null where no site is live. */
export function visitUrl(
    siteId: string | null | undefined,
    apiUrl: string | undefined,
): string | null {
    if (!siteId) return null;
    return `${apiUrl ?? DEFAULT_API_URL}/public/sites/${encodeURIComponent(siteId)}/visit`;
}

const parseVisit = (body: unknown): PublicVisit | undefined =>
    isPublicVisit(body) ? body : undefined;

/**
 * The visit read, shared by every part of a hero that reads it (the row,
 * the Stamp, the Same-day call number): one request. A sample place
 * (`given`) is drawn as a fresh read.
 */
export function useVisitRead(
    siteId: string | null | undefined,
    apiUrl: string | undefined,
    given?: PublicVisit,
): LiveRead<PublicVisit> {
    const own = useLiveRead(
        given ? null : visitUrl(siteId, apiUrl),
        parseVisit,
    );
    return given ? { status: "fresh", data: given } : own;
}

const noSubscribe = () => () => undefined;

/** True once the page has hydrated: nothing about today before then. */
function useHydrated(): boolean {
    return useSyncExternalStore(
        noSubscribe,
        () => true,
        () => false,
    );
}

const SHORT: Record<Weekday, string> = {
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
    SUN: "Sun",
};

/** "10am" → "10 am", "8:30pm" → "8:30 pm": the boards' clock. */
function clock(value: string): string {
    return clockText(value).replace(/(am|pm)$/, " $1");
}

/** A `YYYY-MM-DD` for `now` in the business's zone. */
function dateIn(now: Date, timeZone: string): string {
    try {
        return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
    } catch {
        return now.toISOString().slice(0, 10);
    }
}

/**
 * What the row says about today: "Open now · until 8 pm", "Closed now ·
 * opens 10 am" (later today), "Closed now · opens Tue 10 am" (after
 * closing), and on a day the place does not open at all "Closed today ·
 * opens Tue 10 am". Null when there is nothing true to say.
 */
export function answerOpenWords(
    week: OpeningHoursDay[] | null,
    now: Date,
    timeZone: string,
    closedDates: readonly string[] = [],
): { text: string; open: boolean } | null {
    const state = openState(week, now, timeZone, closedDates);
    if (!state) return null;
    if (state.open) {
        return {
            text: `Open now · until ${clock(state.closesAt)}`,
            open: true,
        };
    }
    if (state.today) {
        return {
            text: `Closed now · opens ${clock(state.opensAt)}`,
            open: false,
        };
    }
    const day = weekdayIn(now, timeZone);
    const shutToday =
        closedDates.includes(dateIn(now, timeZone)) ||
        !week?.some((d) => d.day === day && !d.closed);
    return {
        text: `${shutToday ? "Closed today" : "Closed now"} · opens ${SHORT[state.opensOn]} ${clock(state.opensAt)}`,
        open: false,
    };
}

const LINK =
    "inline-flex min-h-11 min-w-11 items-center gap-1.5 text-[15px] font-medium underline decoration-1 underline-offset-[4px] hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 rounded-[2px]";

export function AnswerRow({
    siteId,
    apiUrl,
    visit: given,
    now,
    look,
    center = false,
    className,
}: {
    siteId?: string | null;
    apiUrl?: string;
    /** A sample place (a template's render), drawn instead of the read. */
    visit?: PublicVisit;
    /** The render's pinned moment (fixtures); the clock otherwise. */
    now?: Date;
    look?: LookId;
    center?: boolean;
    className?: string;
}) {
    const read = useVisitRead(siteId, apiUrl, given);
    const hydrated = useHydrated();
    const visit = hydrated ? read.data : undefined;
    const open = visit
        ? answerOpenWords(
              visit.hours,
              now ?? new Date(),
              visit.timezone,
              visit.closedDates,
          )
        : null;
    const address = said(visit?.address);
    const phone = said(visit?.phone);
    // Classic has no look of its own: the round-ended icons read plainest.
    const icons = look ?? "quiet";
    return (
        <div
            data-site-answer-row=""
            data-live-state={visit ? "ready" : read.status}
            className={cn(
                "flex min-h-11 flex-wrap items-center gap-x-[18px] gap-y-1 text-[15px] leading-[1.3]",
                center && "justify-center",
                className,
            )}
        >
            <span aria-live="polite" className="empty:hidden">
                {open ? (
                    <span
                        data-site-open={open.open ? "open" : "closed"}
                        className="inline-flex min-h-11 items-center gap-2 font-semibold"
                    >
                        <span
                            aria-hidden="true"
                            className={cn(
                                "size-2 shrink-0 rounded-full",
                                open.open
                                    ? "bg-site-status"
                                    : "bg-current opacity-50",
                            )}
                        />
                        {open.text}
                    </span>
                ) : null}
            </span>
            {address ? (
                <a
                    href={directionsHref(address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={LINK}
                >
                    <LookIcon name="pin" look={icons} size={16} />
                    Directions
                </a>
            ) : null}
            {phone ? (
                <a
                    href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                    aria-label={`Call ${phoneText(phone)}`}
                    className={LINK}
                >
                    <LookIcon name="call" look={icons} size={16} />
                    Call
                </a>
            ) : null}
        </div>
    );
}

/**
 * The Stamp in a split hero's image slot when it has no photo: the name
 * and town come from the visit read, so until it answers the slot is held
 * empty at its size (no grey box), and stays so if the read fails. The
 * owner's preview still says "No photo yet" under it.
 */
export function VisitStamp({
    siteId,
    apiUrl,
    visit: given,
    isOwnerPreview = false,
    imageBrief,
    name,
    town = null,
}: {
    siteId?: string | null;
    apiUrl?: string;
    visit?: PublicVisit;
    isOwnerPreview?: boolean;
    imageBrief?: string;
    /**
     * The name and town, given by the server page: the Stamp is drawn at
     * once, in the cached HTML, and nothing is read (not a live fact).
     */
    name?: string | null;
    town?: string | null;
}) {
    const ownName = name?.trim() ? name : null;
    const read = useVisitRead(ownName ? null : siteId, apiUrl, given);
    const visit = read.data;
    const stamp = visit?.name.trim()
        ? { name: visit.name, town: townOf(visit.address) }
        : ownName
          ? { name: ownName, town }
          : null;
    return (
        <div className="grid gap-4">
            {stamp ? (
                <Stamp name={stamp.name} town={stamp.town} />
            ) : (
                <div
                    aria-hidden="true"
                    data-site-stamp=""
                    className="mx-auto aspect-square w-full max-w-[380px]"
                />
            )}
            <OwnerPhotoNote isOwnerPreview={isOwnerPreview} what={imageBrief} />
        </div>
    );
}
