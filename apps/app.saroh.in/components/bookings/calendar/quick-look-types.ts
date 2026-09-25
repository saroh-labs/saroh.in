import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { Slot } from "@/lib/services/service";
import type { BookingRules } from "@/lib/staff/types";

/**
 * What the calendar's quick look and its pieces share: the actions the
 * screen gives them, what they read, and the design's button sizes.
 */

/** What the quick look can do; the screen holds each change for its Undo. */
export interface QuickLookActions {
    checkIn: (b: DiaryBooking) => void;
    noShow: (b: DiaryBooking) => void;
    cancel: (b: DiaryBooking) => void;
    move: (b: DiaryBooking, slot: Slot) => void;
    cancelClass: (seats: DiaryBooking[], title: string) => void;
}

/** Undo for a booking whose change is still held, or null. */
export type HeldFor = (bookingId: string) => (() => void) | null;

export interface QuickLookContext {
    timezone: string;
    /** The clock, read once by the page — never in render. */
    now: number;
    money: boolean;
    rules: BookingRules | null;
    canBook: boolean;
}

export const btn = {
    primary: "h-[38px] rounded-[9px] px-4 text-[14px]",
    ghost: "h-[38px] rounded-[9px] px-4 text-[14px]",
    danger: "h-[38px] rounded-[9px] px-4 text-[14px] text-destructive hover:text-destructive",
};
