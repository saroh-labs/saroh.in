import type { CustomerPick } from "@/lib/customers/picker";
import type { BookingPeople } from "@/lib/services/booking-pay";
import type { LocalDate } from "@/lib/services/diary";
import type { FlowPerson, FlowService } from "@/lib/services/new-booking";
import type { Service } from "@/lib/services/service";
import type { StaffView } from "@/lib/staff/types";

/** What New booking needs from the page that opens it (U8). */
export interface NewBookingSetup {
    /** The business's services that take bookings now. */
    services: FlowService[];
    /** Who takes bookings, or null when they couldn't be read. */
    staff: FlowPerson[] | null;
    /** Customer search and payment, as far as the viewer may (E4). */
    people: BookingPeople;
    /** May read and spend class packs (ADR-007, E12). */
    canUsePacks: boolean;
    /** The business's zone: times are in it, labelled (Q10). */
    timezone: string;
    /** The viewer sees prices (DEC-098). */
    showMoney: boolean;
    /** The business, as its customers know it, for the message. */
    business?: string | null;
    /** What "now" is: the page's, so a test's clock reaches the flow. */
    now?: number;
}

/**
 * What a way in already knows (U8): "Book on this day" the day, a
 * customer's page who, Book their next visit who, what and with whom,
 * leaving the day to the merchant (Q16).
 */
export interface NewBookingPrefill {
    date?: LocalDate | null;
    who?: CustomerPick | null;
    serviceId?: string | null;
    staffId?: string | null;
    /** Book their next visit: Tomorrow, Next week or Pick a date. */
    nextVisit?: boolean;
}

/** The page's services as New booking takes them: those taking bookings. */
export function flowServices(services: readonly Service[]): FlowService[] {
    return services
        .filter((s) => s.status === "ACTIVE")
        .map((s) => ({
            id: s.id,
            name: s.name,
            minutes: s.durationMinutes,
            // What a booking of it costs to pay, GST and all.
            priceCents: s.payCents ?? s.priceCents,
            currency: s.currency,
            capacity: s.capacity,
            bookableByTeam: s.bookableByTeam,
        }));
}

/** The people who take bookings now: on the diary and not paused. */
export function flowStaff(
    staff: readonly StaffView[] | null,
): FlowPerson[] | null {
    if (staff === null) return null;
    return staff
        .filter((p) => p.status === "ACTIVE" && !p.paused)
        .map((p) => ({
            id: p.id,
            name: p.name,
            title: p.title,
            serviceIds: p.serviceIds,
            workDays: Array.from(new Set(p.hours.map((h) => h.dayOfWeek))),
        }));
}
