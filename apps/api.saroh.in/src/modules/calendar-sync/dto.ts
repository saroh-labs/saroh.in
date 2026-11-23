import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
} from "class-validator";

import type { PauseReason } from "./calendar-allowed";
import type { GrantedParts, MeetAccess } from "./google/google-calendar.port";
import { MEET_ACCESS } from "./google/google-calendar.port";

/**
 * `PUT …/calendar/google/accounts/:accountId/calendars`: which of this
 * Google account's calendars Saroh checks for busy times, and, when
 * `writeTo` is given, the one calendar every booking goes to (DEC-233: one
 * across all the person's accounts; choosing one here clears the others).
 * Ids are Google's, checked against the account's own list first.
 */
export class ChooseCalendarsDto {
    /**
     * Bookings go to this calendar of this account. Null: not to this
     * account any more. Absent: left as it is.
     */
    @IsOptional()
    @IsString()
    @MaxLength(1024)
    writeTo?: string | null;

    @IsArray()
    @ArrayMaxSize(50)
    @IsString({ each: true })
    @MaxLength(1024, { each: true })
    checkBusy!: string[];
}

/** `PUT …/calendar/google/meet-access`: the business's default (DEC-233). */
export class MeetAccessDto {
    @IsIn(MEET_ACCESS)
    meetAccess!: MeetAccess;
}

export const BOOKING_MEETING_LINKS = ["GOOGLE_MEET", "MANUAL", "NONE"] as const;
export type BookingMeetingLink = (typeof BOOKING_MEETING_LINKS)[number];

/**
 * `PUT …/calendar/google/bookings/:bookingId/meeting` (DEC-233): give one
 * booking a Google Meet of its own, a link the business pastes (MANUAL,
 * with `meetingUrl`), or go back to its service's (NONE); and who may join
 * its Meet (null: the service's, then the business's). Absent: unchanged.
 */
export class BookingMeetingDto {
    @IsOptional()
    @IsIn(BOOKING_MEETING_LINKS)
    meetingLink?: BookingMeetingLink;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim() : value,
    )
    @IsString()
    @MaxLength(500)
    meetingUrl?: string;

    @IsOptional()
    @IsIn(MEET_ACCESS)
    meetAccess?: MeetAccess | null;
}

/** What connecting starts: Google's consent page. */
export interface ConnectStartView {
    url: string;
}

export interface ChosenCalendarView {
    id: string;
    name: string;
    writeTo: boolean;
    checkBusy: boolean;
}

/** One of the person's Google accounts, a row on their settings. */
export interface CalendarAccountView {
    id: string;
    googleEmail: string;
    /** LAPSED: Google stopped Saroh's access, reconnect. PAUSED: see `pausedBecause`. */
    state: "CONNECTED" | "LAPSED" | "PAUSED";
    calendars: ChosenCalendarView[];
    /** What the person let Saroh do at consent. */
    granted: GrantedParts;
    busyRefreshedAt: string | null;
    /** Busy times are older than two hours: slots are on Saroh's times only. */
    behind: boolean;
}

/** A person's Google Calendar, as their settings show it. */
export interface CalendarStatusView {
    /**
     * NOT_CONNECTED: no account. CONNECTED: at least one account syncs.
     * LAPSED: every account needs reconnecting. PAUSED: kept, but not
     * syncing now (GC-02, GC-03): the plan or the flag left it off, or the
     * person no longer holds `calendar:connect-own` or a place on the
     * diary. It carries on by itself once allowed; Disconnect still works.
     */
    state: "NOT_CONNECTED" | "CONNECTED" | "LAPSED" | "PAUSED";
    /** Why it is PAUSED; null otherwise. */
    pausedBecause: PauseReason | null;
    accounts: CalendarAccountView[];
    /** Where their bookings go (DEC-233): one calendar across their accounts. */
    bookingsGoTo: {
        accountId: string;
        googleEmail: string;
        calendarId: string;
        name: string;
    } | null;
    /** How many Google accounts they may connect; null: no cap. */
    accountsAllowed: number | null;
    /** The business's default for who may join a Meet. */
    meetAccess: MeetAccess;
}

/** After a disconnect: what stays in Google, in words (DEC-233). */
export interface DisconnectView extends CalendarStatusView {
    kept: {
        /** Upcoming bookings whose events stay on Google, no longer updated. */
        upcomingEvents: number;
        message: string;
    };
}

/** One of their Google calendars, to choose from. */
export interface GoogleCalendarOptionView {
    id: string;
    name: string;
    primary: boolean;
    /** Saroh can put bookings on it (they own it). */
    canWrite: boolean;
}

/** Someone on the team who has connected (Team's Google Calendar column). */
export interface CalendarMemberView {
    membershipId: string;
    staffId: string | null;
    name: string;
    accounts: {
        id: string;
        googleEmail: string;
        state: "CONNECTED" | "LAPSED";
    }[];
    /** Their bookings reach Google now. */
    bookingsGoToGoogle: boolean;
    pausedBecause: PauseReason | null;
}

/**
 * `GET …/busy`: each connected person's Google busy times, as start and end
 * and nothing else (never a title), and who is connected, for the Bookings
 * calendar (BKVGoogle).
 */
export interface CalendarBusyView {
    /** Google Calendar is on for this business (the flag and the plan). */
    on: boolean;
    busy: { staffId: string; startAt: string; endAt: string }[];
    /** Someone on the diary with a Google account here, and how it stands. */
    people: { staffId: string; state: "CONNECTED" | "LAPSED" }[];
}

/** `POST …/move-bookings`: how many are on their way. */
export interface MoveBookingsView {
    moving: number;
    message: string;
}

/** A booking's link and who may join it, after a change (DEC-233). */
export interface BookingMeetingView {
    meetingLink: "GOOGLE_MEET" | "MANUAL" | null;
    meetingUrl: string | null;
    meetAccess: {
        /** The booking's own choice; null: the service's or the business's. */
        own: MeetAccess | null;
        /** What applies: own, else service, else business. */
        chosen: MeetAccess;
        /** What Google says the Meet has now; null when unknown or no Meet yet. */
        applied: MeetAccess | null;
    };
    /**
     * READY: the Meet is made. PENDING: Google is still making it, or will
     * be asked shortly. NOT_CONNECTED: whoever takes it has no Google
     * Calendar here, so no Meet is made. NONE: no Google Meet wanted.
     */
    google: "READY" | "PENDING" | "NOT_CONNECTED" | "NONE";
    /** Its event in Google, when Saroh made one (DEC-233). */
    googleEvent: {
        /** The host's Google address: only for the host, or whoever may change roles. */
        googleEmail: string | null;
        /** Saroh still reaches that account and keeps the event up to date. */
        connected: boolean;
        /**
         * The booking changed (moved, cancelled, handed on) after the
         * account was disconnected: the event in Google shows what it was.
         */
        outOfDate: boolean;
        /** Words for the screen; null while all is well. */
        message: string | null;
    } | null;
}
