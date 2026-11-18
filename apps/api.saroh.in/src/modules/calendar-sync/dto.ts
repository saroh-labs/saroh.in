import {
    ArrayMaxSize,
    IsArray,
    IsOptional,
    IsString,
    MaxLength,
} from "class-validator";

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
    state: "NOT_CONNECTED" | "CONNECTED" | "LAPSED";
    googleEmail: string | null;
    calendars: ChosenCalendarView[];
    /** What the person let Saroh do at consent. */
    granted: GrantedParts | null;
    busyRefreshedAt: string | null;
    /** Busy times are older than two hours: slots are on Saroh's times only. */
    behind: boolean;
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
