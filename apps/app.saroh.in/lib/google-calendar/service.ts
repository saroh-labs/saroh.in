import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { apiFetch, destroy, mutate, orgBase } from "@/lib/api/http";

import { refusalOf } from "./refusal";
import type {
    BookingMeeting,
    CalendarMember,
    CalendarRead,
    CalendarStatus,
    DisconnectResult,
    GoogleCalendarOption,
    MeetAccess,
    MoveBookingsResult,
} from "./types";

/**
 * A person's own Google Calendar here (#1047, DEC-233), read and written on
 * the server. The API asks the `GOOGLE_CALENDAR` switch, the plan's
 * `integrations` row and the person's permission every time; this only
 * carries the answer.
 */

const G = "/calendar/google";

/**
 * Their Google Calendar, or why it can't be shown (`CalendarRead`). Shared
 * by the settings tabs and the page in one render. Never throws: a read
 * that failed is `failed`, never "off".
 */
export const readGoogleCalendar = cache(
    async function readGoogleCalendar(): Promise<CalendarRead> {
        try {
            const base = await orgBase();
            if (!base) return { kind: "failed" };
            const res = await apiFetch(`${base}${G}`);
            if (res.ok) {
                return {
                    kind: "ready",
                    status: (await res.json()) as CalendarStatus,
                };
            }
            const body: unknown = await res.json().catch(() => null);
            return refusalOf(res.status, body);
        } catch (error) {
            unstable_rethrow(error);
            return { kind: "failed" };
        }
    },
);

/**
 * Whether a Meet can be made in this business now, as far as this person
 * can tell: Google Calendar is on, the plan has it and Google is set up.
 * Every "Google Meet" choice outside settings is drawn only then.
 */
export async function googleMeetOffered(): Promise<boolean> {
    const { kind } = await readGoogleCalendar();
    // Someone off the diary still books for others, and Meet is on here.
    return kind === "ready" || kind === "off-diary";
}

/**
 * A read that may fail without taking the page: null, never a 403's
 * `forbidden()` (a role that can't see it just doesn't get the part).
 */
async function readOrNull<T>(path: string): Promise<T | null> {
    try {
        const base = await orgBase();
        if (!base) return null;
        const res = await apiFetch(`${base}${G}${path}`);
        return res.ok ? ((await res.json()) as T) : null;
    } catch (error) {
        unstable_rethrow(error);
        return null;
    }
}

/** Who on the team has connected; null when it couldn't be read or isn't theirs to see. */
export const readCalendarMembers = () =>
    readOrNull<CalendarMember[]>("/members");

/** One booking's Meet and its Google event; null when there is none to say. */
export const readBookingMeeting = (bookingId: string) =>
    readOrNull<BookingMeeting>(
        `/bookings/${encodeURIComponent(bookingId)}/meeting`,
    );

/** One of their accounts' calendars, to choose from; null when Google couldn't be asked. */
export const listAccountCalendars = (accountId: string) =>
    readOrNull<GoogleCalendarOption[]>(
        `/accounts/${encodeURIComponent(accountId)}/calendars`,
    );

// The writes. Each says its own sentence when the API gives none.

export const startGoogleConnect = () =>
    mutate<{ url: string }>(
        `${G}/connect`,
        "POST",
        {},
        "Couldn't open Google. Try again.",
    );

export const chooseAccountCalendars = (
    accountId: string,
    choice: { writeTo?: string | null; checkBusy: string[] },
) =>
    mutate<CalendarStatus>(
        `${G}/accounts/${encodeURIComponent(accountId)}/calendars`,
        "PUT",
        choice,
        "Couldn't save your calendars. Try again.",
    );

export const disconnectGoogleAccount = (accountId: string) =>
    destroy<DisconnectResult>(
        `${G}/accounts/${encodeURIComponent(accountId)}`,
        "Couldn't disconnect it. Try again.",
    );

export const disconnectGoogleMember = (membershipId: string) =>
    destroy<DisconnectResult>(
        `${G}/members/${encodeURIComponent(membershipId)}`,
        "Couldn't disconnect them. Try again.",
    );

export const moveGoogleBookings = () =>
    mutate<MoveBookingsResult>(
        `${G}/move-bookings`,
        "POST",
        {},
        "Couldn't move your bookings. Try again.",
    );

export const setBusinessMeetAccess = (meetAccess: MeetAccess) =>
    mutate<{ meetAccess: MeetAccess; updating: number }>(
        `${G}/meet-access`,
        "PUT",
        { meetAccess },
        "Couldn't save who can join. Try again.",
    );

export const setBookingMeeting = (
    bookingId: string,
    input: {
        meetingLink?: "GOOGLE_MEET" | "MANUAL" | "NONE";
        meetingUrl?: string;
        meetAccess?: MeetAccess | null;
    },
) =>
    mutate<BookingMeeting>(
        `${G}/bookings/${encodeURIComponent(bookingId)}/meeting`,
        "PUT",
        input,
        "Couldn't save the link. Try again.",
    );
