import type { OpeningHoursDay, Weekday } from "./storefronts";

const DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/**
 * A week to start from when a shop has never saved one: Monday to Saturday,
 * 9 to 6. The Hours sheets start their draft from it, and someone new on
 * the diary starts with it when the business has no opening hours
 * (`lib/staff/starting-week.ts`). In a plain module so a Server Action can
 * read it too.
 */
export const DEFAULT_WEEK: OpeningHoursDay[] = DAYS.map((day) => ({
    day,
    open: "09:00",
    close: "18:00",
    closed: day === "SUN",
}));
