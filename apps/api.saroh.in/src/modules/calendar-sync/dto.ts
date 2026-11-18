import {
    ArrayMaxSize,
    IsArray,
    IsOptional,
    IsString,
    MaxLength,
} from "class-validator";

import type { PauseReason } from "./calendar-allowed";
import type { GrantedParts } from "./google/google-calendar.port";

/**
 * `PUT …/calendar/google/calendars`: which of their Google calendars Saroh
 * writes bookings to, and which it checks for busy times. Ids are Google's,
 * checked against the person's own list before anything is kept.
 */
export class ChooseCalendarsDto {
    /** The calendar bookings go on; null or absent: none. */
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

/** A person's Google Calendar, as their settings show it. */
export interface CalendarStatusView {
    /**
     * PAUSED: kept, but not syncing now (GC-02, GC-03): the business's
     * plan or the flag left it off, or the person no longer holds
     * `calendar:connect-own` or a place on the diary. It carries on by
     * itself once allowed again; Disconnect still works.
     */
    state: "NOT_CONNECTED" | "CONNECTED" | "LAPSED" | "PAUSED";
    googleEmail: string | null;
    calendars: ChosenCalendarView[];
    /** What the person let Saroh do at consent. */
    granted: GrantedParts | null;
    busyRefreshedAt: string | null;
    /** Busy times are older than two hours: slots are on Saroh's times only. */
    behind: boolean;
    /** Why it is PAUSED; null otherwise. */
    pausedBecause: PauseReason | null;
    /** How many calendars they may choose (one today). */
    calendarsAllowed: number;
}

/** One of their Google calendars, to choose from. */
export interface GoogleCalendarOptionView {
    id: string;
    name: string;
    primary: boolean;
    /** Saroh can put bookings on it (they own it). */
    canWrite: boolean;
}
