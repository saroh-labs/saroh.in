import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import type { CrmResult } from "@/lib/api/http";
import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * Bookable Services data access for app.saroh.in (S4-003). Org-scoped Service
 * CRUD, availability-rule management and booking list / cancel, reached only
 * through api.saroh.in (the app never touches the DB). Every call rides the
 * shared CRM HTTP plumbing (`lib/api/http`), which forwards the session cookie
 * and the active-org header so the api resolves the caller and enforces the
 * `service:*` / `booking:*` policy. Server-only: the plumbing imports
 * next/headers, so this must never reach a client component.
 */

export type ServiceStatus = "ACTIVE" | "ARCHIVED";

/** Where a service happens (ADR-007): at the business, or by a link. */
export type LocationType = "IN_PERSON" | "ONLINE";

/** A bookable Service (mirror of the api's Service row, JSON-serialized). */
export interface Service {
    id: string;
    organizationId: string;
    siteId: string | null;
    name: string;
    description: string | null;
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    capacity: number;
    priceCents: number | null;
    currency: string | null;
    /** GST the price includes, in percent, and its SAC code (ADR-008). */
    gstRate?: string | null;
    sacCode?: string | null;
    timezone: string;
    status: ServiceStatus;
    locationType: LocationType;
    /** The link an online service's bookers join by; null in person. */
    meetingUrl: string | null;
    createdAt: string;
    updatedAt: string;
}

/** One recurring weekly availability window (in the Service's timezone). */
export interface AvailabilityRule {
    id: string;
    serviceId: string;
    /** 0 = Sunday … 6 = Saturday. */
    dayOfWeek: number;
    /** Minutes from local midnight, inclusive (0–1439). */
    startMinute: number;
    /** Minutes from local midnight, exclusive; > startMinute (1–1440). */
    endMinute: number;
}

// The booking state vocabulary and its predicates live in ./booking-state,
// which imports nothing — the bookings TABLE is a client component and this
// module reaches next/headers through the CRM HTTP plumbing. Imported for use
// below AND re-exported, so server callers still have one place to look.
import type { BookingOutcome, BookingStatus } from "./booking-state";

export type { BookingOutcome, BookingStatus };

/** A reserved slot (mirror of the api's Booking row, JSON-serialized). */
export interface Booking {
    id: string;
    serviceId: string;
    /** Absolute-UTC ISO instants. */
    startAt: string;
    endAt: string;
    /** IANA timezone the booker saw the slot in. */
    timezone: string;
    status: BookingStatus;
    /** Set only by a person; never derived from the slot having passed. */
    outcome: BookingOutcome | null;
    bookerName: string | null;
    bookerEmail: string | null;
    bookerPhone: string | null;
    createdAt: string;
    cancelledAt: string | null;
    /**
     * The CRM contact this booking belongs to, when one is linked.
     *
     * Preferred over `bookerName` for display: the typed-in name is whatever the
     * booker put in a public form, while the contact is the record the business
     * actually keeps. Null for a walk-in booked without a contact.
     */
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
    } | null;
}

/** What has happened to a booking, in order (#121). */
export interface BookingEvent {
    id: string;
    type: "BOOKED" | "RESCHEDULED" | "CANCELLED" | "ATTENDED" | "NO_SHOW";
    /** Null when the booker did it themselves through the public form. */
    actor: { name: string | null } | null;
    fromStartAt: string | null;
    toStartAt: string | null;
    createdAt: string;
}

/**
 * One booking with everything the detail screen states (#121): the service it
 * is for, the contact it belongs to, and its history.
 *
 * `snapshot` is the terms as they were agreed at booking time, so the slot
 * inside it is the ORIGINAL one — it is not rewritten when a booking moves.
 */
export interface BookingDetail extends Omit<Booking, "contact"> {
    service: Service;
    contact:
        (NonNullable<Booking["contact"]> & { phone: string | null }) | null;
    events: BookingEvent[];
    snapshot: unknown;
    /**
     * The class pack paying for it (ADR-007). A pack taken back off leaves
     * `reversedAt` set: the booking is no longer paid with it.
     */
    packRedemption: {
        reversedAt: string | null;
        purchase: { id: string; pack: { name: string } };
    } | null;
}

/** One open slot on a service, as the api's availability preview returns it. */
export interface Slot {
    startAt: string;
    endAt: string;
}

/** A booking joined with a light snapshot of its owning Service. */
export interface BookingWithService extends Booking {
    service: { id: string; name: string; timezone: string } | null;
}

// The calendar read's shape and its pure shaping live in ./booking-calendar,
// which client components can import; re-exported so server callers have one
// place to look.
import type { BookingsCalendar } from "./booking-calendar";
import { flattenCalendar } from "./booking-calendar";

export { flattenCalendar } from "./booking-calendar";
export type {
    BookingsCalendar,
    ClassSession,
    DiaryBooking,
    PaidWith,
    PersonDiary,
} from "./booking-calendar";

export interface CreateServiceInput {
    name: string;
    description?: string;
    durationMinutes: number;
    bufferBeforeMinutes?: number;
    bufferAfterMinutes?: number;
    capacity?: number;
    priceCents?: number;
    currency?: string;
    gstRate?: string | null;
    sacCode?: string | null;
    timezone: string;
    locationType?: LocationType;
    meetingUrl?: string | null;
}

/** Update a Service (PATCH semantics — every field optional). */
export interface UpdateServiceInput {
    name?: string;
    description?: string;
    durationMinutes?: number;
    bufferBeforeMinutes?: number;
    bufferAfterMinutes?: number;
    capacity?: number;
    priceCents?: number;
    currency?: string;
    gstRate?: string | null;
    sacCode?: string | null;
    timezone?: string;
    status?: ServiceStatus;
    locationType?: LocationType;
    /** `null` clears it; the API also clears it on going back to in person. */
    meetingUrl?: string | null;
}

/** One availability window to persist (no id — position is not meaningful). */
export interface AvailabilityRuleInput {
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
}

/**
 * Send a mutation to a services route and return an {@link ApiResult} — with
 * the field a refusal is about, so a form can put it there (the meeting link,
 * say). Unlike `lib/api/http`'s `mutate`, this also carries PUT/DELETE (the
 * rule-replace and archive/cancel verbs) and paths are relative to the
 * services base.
 */
async function send<T>(
    path: string,
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    body: unknown,
    fallback: string,
): Promise<ApiResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/services${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) {
        return { ok: true, data: (data ?? {}) as T };
    }
    return toFailure(data, fallback);
}

// ---------------------------------------------------------------------------
// Reads (called from server components)
// ---------------------------------------------------------------------------

/**
 * The org's services, or why they could not be read. For callers that must
 * tell "none" from "failed" (the site editor's pickers): a failed read is
 * never an empty one (`frontend-error-feedback.md`). A 403 is reported as
 * such, so the picker can say the person has no access rather than offer a
 * retry that cannot work.
 */
export async function readServices(): Promise<
    { ok: true; services: Service[] } | { ok: false; forbidden: boolean }
> {
    const base = await orgBase();
    if (!base) return { ok: false, forbidden: false };
    try {
        const res = await apiFetch(`${base}/services`);
        if (res.status === 403) return { ok: false, forbidden: true };
        if (!res.ok) return { ok: false, forbidden: false };
        return { ok: true, services: (await res.json()) as Service[] };
    } catch {
        return { ok: false, forbidden: false };
    }
}

/** The org's services, newest first (excludes soft-deleted). Empty on failure. */
export async function listServices(): Promise<Service[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(`${base}/services`);
    if (!res.ok) return [];
    return (await res.json()) as Service[];
}

/** One owned service, or null when missing / not permitted. */
export async function getService(serviceId: string): Promise<Service | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/services/${serviceId}`);
    if (!res.ok) return null;
    return (await res.json()) as Service;
}

/** A service's availability rules (day + start/end). Empty on any failure. */
export async function listRules(
    serviceId: string,
): Promise<AvailabilityRule[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(`${base}/services/${serviceId}/rules`);
    if (!res.ok) return [];
    return (await res.json()) as AvailabilityRule[];
}

/** A single service's bookings (newest slot first). Empty on any failure. */
export async function listServiceBookings(
    serviceId: string,
): Promise<Booking[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(`${base}/services/${serviceId}/bookings`);
    if (!res.ok) return [];
    return (await res.json()) as Booking[];
}

/**
 * One booking with its service, contact and history (#121), or null when it is
 * missing or not this org's.
 */
export async function getBooking(
    bookingId: string,
): Promise<BookingDetail | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/services/bookings/${bookingId}`);
    if (!res.ok) return null;
    return (await res.json()) as BookingDetail;
}

/**
 * A service's open slots between two instants — what the reschedule picker
 * offers. Empty on any failure, which the picker renders as "no open times"
 * rather than a broken control.
 */
export async function listAvailability(
    serviceId: string,
    fromISO: string,
    toISO: string,
): Promise<Slot[]> {
    const base = await orgBase();
    if (!base) return [];
    const query = new URLSearchParams({ from: fromISO, to: toISO });
    const res = await apiFetch(
        `${base}/services/${serviceId}/availability?${query.toString()}`,
    );
    if (!res.ok) return [];
    return (await res.json()) as Slot[];
}

/**
 * The bookings calendar over `[from, to)` in one read (U4): a diary per
 * person, Unassigned last, class starts as sessions with who is booked and
 * how each paid. Null when it could not be read — a failed read is never an
 * empty one (`frontend-error-feedback.md`).
 */
export async function readBookingsCalendar(
    fromISO: string,
    toISO: string,
    staffId?: string,
): Promise<BookingsCalendar | null> {
    const base = await orgBase();
    if (!base) return null;
    const query = new URLSearchParams({ from: fromISO, to: toISO });
    if (staffId) query.set("staffId", staffId);
    try {
        const res = await apiFetch(
            `${base}/services/bookings?${query.toString()}`,
        );
        if (!res.ok) return null;
        return (await res.json()) as BookingsCalendar;
    } catch {
        return null;
    }
}

/** How far back and ahead the bookings register reads: a year each way. */
const REGISTER_REACH_MS = 365 * 86_400_000;

/**
 * Every booking across the org's services within a year either side of now,
 * each with its Service (name + timezone), sorted by slot ascending — the
 * shape the bookings register renders. One read of the calendar (U4) instead
 * of a fan-out over every service. Empty when there is no active org or the
 * read fails.
 */
export async function listAllBookings(): Promise<BookingWithService[]> {
    const now = Date.now();
    const calendar = await readBookingsCalendar(
        new Date(now - REGISTER_REACH_MS).toISOString(),
        new Date(now + REGISTER_REACH_MS).toISOString(),
    );
    return calendar ? flattenCalendar(calendar) : [];
}

/**
 * Upcoming bookings across the org's services (slot not yet ended), sorted by
 * slot ascending — the owner calendar's default view. Computed here (not in the
 * server component) so "now" stays out of render.
 */
export async function listUpcomingBookings(): Promise<BookingWithService[]> {
    const all = await listAllBookings();
    const now = Date.now();
    return all.filter((booking) => new Date(booking.endAt).getTime() >= now);
}

/**
 * Every booking, upcoming and past (#241).
 *
 * The calendar showed only what was still to come, which was right while a
 * booking had nothing to say once it was over. Now it does: an outcome is
 * recorded by a person, so the appointments waiting to be marked have to be
 * findable. Past bookings were never deleted — they were only filtered out of
 * every surface.
 */
export async function listBookingsWithPast(): Promise<BookingWithService[]> {
    return listAllBookings();
}

// The pure state predicates live in ./booking-state so the bookings TABLE (a
// client component) can import them — this module reaches next/headers and
// cannot be imported from the client. Re-exported so server callers have one
// place to look.
export { hasEnded, needsOutcome } from "./booking-state";

// ---------------------------------------------------------------------------
// Mutations (wrapped by server actions in ./actions)
// ---------------------------------------------------------------------------

/** Create a bookable service. Returns the new service (with its id). */
export function createService(
    input: CreateServiceInput,
): Promise<ApiResult<Service>> {
    return send<Service>("", "POST", input, "Could not create the service");
}

/** Patch a service's terms / status. */
export function updateService(
    serviceId: string,
    input: UpdateServiceInput,
): Promise<ApiResult<Service>> {
    return send<Service>(
        `/${serviceId}`,
        "PATCH",
        input,
        "Could not update the service",
    );
}

/** Soft-delete (archive) a service so it stops accepting bookings. */
export function archiveService(
    serviceId: string,
): Promise<CrmResult<{ id: string; deleted: true }>> {
    return send<{ id: string; deleted: true }>(
        `/${serviceId}`,
        "DELETE",
        undefined,
        "Could not archive the service",
    );
}

/** Replace a service's ENTIRE set of availability rules (PUT semantics). */
export function replaceRules(
    serviceId: string,
    rules: AvailabilityRuleInput[],
): Promise<CrmResult<AvailabilityRule[]>> {
    return send<AvailabilityRule[]>(
        `/${serviceId}/rules`,
        "PUT",
        { rules },
        "Could not save the availability",
    );
}

/** Cancel a booking, freeing its slot. Idempotent server-side. */
/** Record how an appointment went (#241). */
export function recordBookingOutcome(
    bookingId: string,
    outcome: BookingOutcome,
): Promise<CrmResult<Booking>> {
    return send<Booking>(
        `/bookings/${bookingId}/outcome`,
        "POST",
        { outcome },
        "Could not record how it went",
    );
}

/** Move a booking to another slot (#121). */
/** Who a booking made by hand is for: a contact, or someone new. */
export type BookByHandInput = {
    startAt: string;
    idempotencyKey?: string;
    /** Pay with this class pack (ADR-007); needs `pack:write`. */
    packPurchaseId?: string;
} & ({ contactId: string } | { bookerEmail: string; bookerName?: string });

/**
 * Book someone in by hand (#384): the same open-slot and capacity rules as
 * the booking page, with the history naming who made it.
 */
export function bookByHand(
    serviceId: string,
    input: BookByHandInput,
): Promise<ApiResult<Booking>> {
    return send<Booking>(
        `/${serviceId}/bookings`,
        "POST",
        input,
        "Could not make the booking",
    );
}

export function rescheduleBooking(
    bookingId: string,
    startAt: string,
): Promise<CrmResult<Booking>> {
    return send<Booking>(
        `/bookings/${bookingId}`,
        "PATCH",
        { startAt },
        "Could not move the booking",
    );
}

export function cancelBooking(bookingId: string): Promise<CrmResult<Booking>> {
    return send<Booking>(
        `/bookings/${bookingId}`,
        "DELETE",
        undefined,
        "Could not cancel the booking",
    );
}
