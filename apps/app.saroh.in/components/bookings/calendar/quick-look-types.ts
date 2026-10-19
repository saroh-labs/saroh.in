import type { NoticeChannels } from "@/lib/messages/notice-reach";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { Slot } from "@/lib/services/service";
import type { BookingRules } from "@/lib/staff/types";

/**
 * What the calendar's quick look and its pieces share: the actions the
 * screen gives them and what they read.
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
    /**
     * `payment:manage`: may change what the business's policy does with
     * the money when a paid booking is cancelled (DEC-170, Q14).
     */
    canRefund?: boolean;
    /** `service:write`: "Edit this class" in a class's More. */
    canEditService?: boolean;
    /** `order:read`: a treatment's order is a link, else words (E10). */
    canReadOrder?: boolean;
    /**
     * Taking payment at the desk (P2): `booking:write` and `invoice:write`,
     * and whether a payment link can be sent instead (a provider connected).
     */
    desk?: {
        canTake: boolean;
        canLink: boolean;
        /** The plan takes payment online (R33); else no link is offered. */
        online?: boolean;
    };
    /**
     * What the business can tell its customers with (A14); null when it
     * couldn't be read.
     */
    notices?: NoticeChannels | null;
}
