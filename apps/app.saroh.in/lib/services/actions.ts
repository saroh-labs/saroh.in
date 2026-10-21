"use server";

import type { BookingMoney } from "./booking-money";
import type { DeskPaymentInput } from "./desk-pay";
import type { PeekPerson } from "./peek";
import { readPeekPerson } from "./peek-person";
import type {
    AvailabilityRuleInput,
    BookByHandInput,
    BookingOutcome,
    CreateServiceInput,
    Service,
    Slot,
    UpdateServiceInput,
} from "./service";
import {
    archiveService as archiveServiceApi,
    bookByHand as bookByHandApi,
    bookVisit as bookVisitApi,
    cancelBooking as cancelBookingApi,
    createBookingPayLink as createBookingPayLinkApi,
    createService as createServiceApi,
    getBooking,
    listAvailability as listAvailabilityApi,
    readReassignCandidates as readReassignCandidatesApi,
    readServices,
    reassignBooking as reassignBookingApi,
    recordBookingOutcome as recordBookingOutcomeApi,
    replaceRules as replaceRulesApi,
    rescheduleBooking as rescheduleBookingApi,
    takeDeskPayment as takeDeskPaymentApi,
    turnDownBooking as turnDownBookingApi,
    updateService as updateServiceApi,
} from "./service";

/**
 * Server Actions for bookable Services (S4-003). Thin wrappers that forward the
 * session cookie + active-org header to api.saroh.in (via the service); the api
 * resolves the caller from the session and enforces `service:*` / `booking:*`.
 * Client components (the service + availability forms, the booking-cancel
 * control, the site editor's service picker) call these — never the api or the
 * DB directly.
 */

export async function bookByHand(serviceId: string, input: BookByHandInput) {
    return bookByHandApi(serviceId, input);
}

/** Book the next visit of a treatment (E10), against its order. */
export async function bookVisit(
    orderId: string,
    input: { visitNumber: number; startAt: string; staffId?: string },
) {
    return bookVisitApi(orderId, input);
}

/** "Take ₹X" at the desk for a booking (P2). */
export async function takeDeskPayment(
    bookingId: string,
    input: DeskPaymentInput,
) {
    return takeDeskPaymentApi(bookingId, input);
}

/** "Send a payment link" for a booking just made (E4). */
export async function createBookingPayLink(bookingId: string) {
    return createBookingPayLinkApi(bookingId);
}

export async function createService(input: CreateServiceInput) {
    return createServiceApi(input);
}

export async function updateService(
    serviceId: string,
    input: UpdateServiceInput,
) {
    return updateServiceApi(serviceId, input);
}

export async function archiveService(serviceId: string) {
    return archiveServiceApi(serviceId);
}

export async function replaceRules(
    serviceId: string,
    rules: AvailabilityRuleInput[],
) {
    return replaceRulesApi(serviceId, rules);
}

export async function cancelBooking(
    bookingId: string,
    options: {
        returnCredit?: boolean;
        closesClass?: boolean;
        /** Why the whole class is cancelled (DEC-178, #1172). */
        reason?: string;
    } = {},
) {
    return cancelBookingApi(bookingId, options);
}

/**
 * Turn down a booking awaiting payment from Home (review #11): cancelled
 * only while it still awaits its money; `paid` when the customer paid in
 * the meantime.
 */
export async function turnDownBooking(bookingId: string) {
    return turnDownBookingApi(bookingId);
}

/**
 * What the cancel sheet needs to ask its money question (U3, BA-01), read
 * when a screen that doesn't hold the booking's money (the list) asks to
 * cancel it: the money, the free-cancel time fixed at booking and the
 * business's zone. Null when it can't be read.
 */
export async function readBookingForCancel(bookingId: string): Promise<{
    money: BookingMoney | null;
    freeCancelUntil: string | null;
    timezone: string;
} | null> {
    const booking = await getBooking(bookingId);
    if (!booking) return null;
    return {
        money: booking.money ?? null,
        freeCancelUntil: booking.freeCancelUntil ?? null,
        timezone: booking.service.timezone || booking.timezone,
    };
}

/** Move a booking to another slot (#121). */
export async function rescheduleBooking(bookingId: string, startAt: string) {
    return rescheduleBookingApi(bookingId, startAt);
}

/** Change who a booking is with, optionally at a new time (#1157). */
export async function reassignBooking(
    bookingId: string,
    input: { staffId: string; startAt?: string },
) {
    return reassignBookingApi(bookingId, input);
}

/** Who could take a booking at a time (#1157): Change who's list. */
export async function readReassignCandidates(
    bookingId: string,
    startAt?: string,
) {
    return readReassignCandidatesApi(bookingId, startAt);
}

/**
 * The person behind a booking, read when its peek opens (E5): their phone and
 * Needs attention, as far as the viewer's role may see. Null when they can't
 * be read.
 */
export async function readBookingPerson(
    contactId: string,
): Promise<PeekPerson | null> {
    return readPeekPerson(contactId);
}

/** Record how an appointment went (#241). */
export async function recordBookingOutcome(
    bookingId: string,
    outcome: BookingOutcome,
) {
    return recordBookingOutcomeApi(bookingId, outcome);
}

/**
 * The open slots the reschedule picker offers. Read through an action because
 * the picker widens its own window as the merchant looks further ahead, and
 * a server component cannot re-read on a click.
 */
export async function listAvailability(
    serviceId: string,
    fromISO: string,
    toISO: string,
    staffId?: string,
): Promise<Slot[]> {
    return listAvailabilityApi(serviceId, fromISO, toISO, staffId);
}

/**
 * The org's services as a light picker list `{ id, name, status }`, used by the
 * site editor's booking and services-list pickers. Services are authored in the
 * service editor (not inline), so the editor reads them through this action.
 *
 * Returns a result rather than an empty list on failure, so a picker never
 * tells a merchant they have no services, or that chosen ones were deleted,
 * because a read failed.
 */
export async function listServicesForPicker(): Promise<
    | {
          ok: true;
          services: { id: string; name: string; status: Service["status"] }[];
      }
    | { ok: false; forbidden: boolean }
> {
    const read = await readServices();
    if (!read.ok) return read;
    return {
        ok: true,
        services: read.services.map((s) => ({
            id: s.id,
            name: s.name,
            status: s.status,
        })),
    };
}
