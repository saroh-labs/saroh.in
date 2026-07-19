"use server";

import type {
    AvailabilityRuleInput,
    CreateServiceInput,
    Service,
    UpdateServiceInput,
} from "./service";
import {
    archiveService as archiveServiceApi,
    cancelBooking as cancelBookingApi,
    createService as createServiceApi,
    listServices as listServicesApi,
    replaceRules as replaceRulesApi,
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
