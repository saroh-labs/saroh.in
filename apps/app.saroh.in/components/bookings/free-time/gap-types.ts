import type { LocalDate, Span } from "@/lib/services/diary";
import type { GapStep } from "@/lib/services/free-time";
import type { StaffView } from "@/lib/staff/types";

/** A free time on the calendar: whose, which day, and its minutes (U9). */
export interface GapTarget {
    staff: StaffView;
    date: LocalDate;
    free: Span;
}

/** What the sheet's heading says, as the form moves (Book or Block, a step). */
export interface GapHead {
    mode: "book" | "block";
    step: GapStep;
    /** The chosen service's start, or the free time's. */
    at: number;
    booked: boolean;
}
