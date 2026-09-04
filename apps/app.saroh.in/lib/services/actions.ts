"use server";

import type {
    AvailabilityRuleInput,
    CreateServiceInput,
    Service,
    Slot,
    UpdateServiceInput,
} from "./service";
import {
    archiveService as archiveServiceApi,
    cancelBooking as cancelBookingApi,
    createService as createServiceApi,
    listAvailability as listAvailabilityApi,
    listServices as listServicesApi,
    replaceRules as replaceRulesApi,
    rescheduleBooking as rescheduleBookingApi,
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

export async function cancelBooking(bookingId: string) {
    return cancelBookingApi(bookingId);
}

/** Move a booking to another slot (#121). */
export async function rescheduleBooking(bookingId: string, startAt: string) {
    return rescheduleBookingApi(bookingId, startAt);
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
): Promise<Slot[]> {
    return listAvailabilityApi(serviceId, fromISO, toISO);
}

/**
 * The org's services as a light picker list `{ id, name, status }`, used by the
 * site editor's booking-section service picker. Services are authored in the
 * service editor (not inline), so the editor reads them through this action.
 */
export async function listServicesForPicker(): Promise<
    { id: string; name: string; status: Service["status"] }[]
> {
    const services = await listServicesApi();
    return services.map((s) => ({ id: s.id, name: s.name, status: s.status }));
}
