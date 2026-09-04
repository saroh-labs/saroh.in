import type { CrmResult } from "@/lib/api/http";
import { apiFetch, orgBase, readError } from "@/lib/api/http";

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
    timezone: string;
    status: ServiceStatus;
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

export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

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
    type: "BOOKED" | "RESCHEDULED" | "CANCELLED";
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

export interface CreateServiceInput {
    name: string;
    description?: string;
    durationMinutes: number;
    bufferBeforeMinutes?: number;
    bufferAfterMinutes?: number;
    capacity?: number;
    priceCents?: number;
    currency?: string;
    timezone: string;
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
    timezone?: string;
    status?: ServiceStatus;
}

/** One availability window to persist (no id — position is not meaningful). */
export interface AvailabilityRuleInput {
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
}

/**
 * Send a mutation to a services route and return a {@link CrmResult}. Unlike
 * `lib/api/http`'s `mutate`, this also carries PUT/DELETE (the rule-replace and
 * archive/cancel verbs) and paths are relative to the services base.
 */
async function send<T>(
    path: string,
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    body: unknown,
    fallback: string,
): Promise<CrmResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/services${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = (await res.json().catch(() => null)) as
        (T & { message?: string; error?: string }) | null;
    if (res.ok) {
        return { ok: true, data: (data ?? {}) as T };
    }
    return { ok: false, error: readError(data, fallback) };
}

// ---------------------------------------------------------------------------
// Reads (called from server components)
// ---------------------------------------------------------------------------

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
 * Every booking across the org's services, each joined with its owning
 * Service (name + timezone), sorted by slot ascending — the shape the owner
 * calendar renders. The api exposes bookings per-service, so this fans out over
 * the org's services and merges. Empty when there is no active org.
 */
export async function listAllBookings(): Promise<BookingWithService[]> {
    const services = await listServices();
    if (services.length === 0) return [];

    const perService = await Promise.all(
        services.map(async (service) => {
            const bookings = await listServiceBookings(service.id);
            return bookings.map<BookingWithService>((booking) => ({
                ...booking,
                service: {
                    id: service.id,
                    name: service.name,
                    timezone: service.timezone,
                },
            }));
        }),
    );

    return perService.flat().sort((a, b) => a.startAt.localeCompare(b.startAt));
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

// ---------------------------------------------------------------------------
// Mutations (wrapped by server actions in ./actions)
// ---------------------------------------------------------------------------

/** Create a bookable service. Returns the new service (with its id). */
export function createService(
    input: CreateServiceInput,
): Promise<CrmResult<Service>> {
    return send<Service>("", "POST", input, "Could not create the service");
}

/** Patch a service's terms / status. */
export function updateService(
    serviceId: string,
    input: UpdateServiceInput,
): Promise<CrmResult<Service>> {
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
/** Move a booking to another slot (#121). */
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
