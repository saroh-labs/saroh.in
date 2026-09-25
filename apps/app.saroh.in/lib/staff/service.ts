import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type {
    BookingBrief,
    BookingRules,
    StaffList,
    StaffView,
    WeeklyRange,
} from "./types";

export type * from "./types";

/**
 * Staff, their hours, time off and the business's booking rules (U3), reached
 * through api.saroh.in. Reads need `service:read`, writes `service:write`;
 * the API decides. Server-only: the plumbing imports next/headers.
 */

/** Everyone on the diary (archived too), or null when there is no business. */
export async function listStaff(): Promise<StaffList | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<StaffList>(`${base}/staff`);
}

/** The business's booking rules. */
export async function getBookingRules(): Promise<BookingRules | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<BookingRules>(`${base}/booking-rules`);
}

async function send<T>(
    path: string,
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    body: unknown,
    fallback: string,
): Promise<ApiResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    return toFailure(data, fallback);
}

export interface CreateStaffInput {
    name: string;
    title?: string;
    membershipId?: string;
    serviceIds?: string[];
    hours?: WeeklyRange[];
}

export function createStaff(input: CreateStaffInput) {
    return send<StaffView>("/staff", "POST", input, "Could not add them");
}

export function updateStaff(
    staffId: string,
    input: {
        name?: string;
        title?: string | null;
        status?: "ACTIVE" | "ARCHIVED";
    },
) {
    return send<StaffView>(
        `/staff/${staffId}`,
        "PATCH",
        input,
        "Could not save them",
    );
}

export function setStaffServices(staffId: string, serviceIds: string[]) {
    return send<StaffView>(
        `/staff/${staffId}/services`,
        "PUT",
        { serviceIds },
        "Could not save who takes it",
    );
}

/** Replace the weekly hours; answers with kept bookings now outside them. */
export function replaceStaffHours(staffId: string, hours: WeeklyRange[]) {
    return send<{ staff: StaffView; outside: BookingBrief[] }>(
        `/staff/${staffId}/hours`,
        "PUT",
        { hours },
        "Could not save the hours",
    );
}

export function addExtraHours(
    staffId: string,
    input: { date: string; startMinute: number; endMinute: number },
) {
    return send<StaffView>(
        `/staff/${staffId}/extra-hours`,
        "POST",
        input,
        "Could not open those hours",
    );
}

export function removeExtraHours(staffId: string, extraHoursId: string) {
    return send<{ staff: StaffView; outside: BookingBrief[] }>(
        `/staff/${staffId}/extra-hours/${extraHoursId}`,
        "DELETE",
        undefined,
        "Could not close those hours",
    );
}

/** Whole local days (`fromDate`–`toDate`) or a stretch (`startAt`–`endAt`). */
export interface TimeOffInput {
    fromDate?: string;
    toDate?: string;
    startAt?: string;
    endAt?: string;
    reason?: string;
}

export function addTimeOff(staffId: string, input: TimeOffInput) {
    return send<{ staff: StaffView; affected: BookingBrief[] }>(
        `/staff/${staffId}/time-off`,
        "POST",
        input,
        "Could not add the time off",
    );
}

export function removeTimeOff(staffId: string, timeOffId: string) {
    return send<StaffView>(
        `/staff/${staffId}/time-off/${timeOffId}`,
        "DELETE",
        undefined,
        "Could not remove the time off",
    );
}

export function updateBookingRules(input: Partial<BookingRules>) {
    return send<BookingRules>(
        "/booking-rules",
        "PUT",
        input,
        "Could not save the booking rules",
    );
}
