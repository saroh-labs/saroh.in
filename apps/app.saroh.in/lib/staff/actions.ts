"use server";

import type { ApiResult } from "@/lib/api/failure";
import { listServices } from "@/lib/services/service";

import type {
    AddedSelf,
    BookingRules,
    OfferedRead,
    OffRangeInput,
    WeeklyRange,
} from "./service";
import * as staff from "./service";
import { hasOpening, startingWeek } from "./starting-week";

/**
 * Server Actions for staff, hours, time off and booking rules (U3). Thin
 * wrappers: the API resolves the caller and enforces `service:write`.
 */

export async function createStaff(input: staff.CreateStaffInput) {
    return staff.createStaff(input);
}

/**
 * Someone new on the diary, starting with the business's opening hours as
 * their weekly hours (the default week when none are saved, or when they
 * couldn't be read), so nobody starts with an empty week.
 */
export async function addPerson(input: { name: string; title?: string }) {
    const opening = await staff.readOpeningHours();
    return staff.createStaff({ ...input, hours: startingWeek(opening) });
}

/**
 * "It's just me": the signed-in person on the diary in one press, with the
 * opening hours as their week and every service that takes bookings as
 * theirs, so customers can book them at once. Answers with which week they
 * started with, for the toast to say. `hours`, when given, is the week they
 * chose instead (Hours and time off's "Choose different hours", U17).
 */
export async function addMyself(
    hours?: WeeklyRange[],
): Promise<ApiResult<AddedSelf>> {
    const [opening, services] = await Promise.all([
        staff.readOpeningHours(),
        listServices().catch(() => []),
    ]);
    const res = await staff.addSelf({
        hours: hours ?? startingWeek(opening),
        serviceIds: services
            .filter((s) => s.status === "ACTIVE")
            .map((s) => s.id),
    });
    if (!res.ok) return res;
    return {
        ok: true,
        data: {
            staff: res.data,
            week: hasOpening(opening) ? "opening" : "default",
        },
    };
}

/** The times the booking page offers, for Availability's preview. */
export async function readOffered(
    serviceId: string,
    staffId?: string,
): Promise<OfferedRead> {
    return staff.readOffered(serviceId, staffId);
}

export async function updateStaff(
    staffId: string,
    input: Parameters<typeof staff.updateStaff>[1],
) {
    return staff.updateStaff(staffId, input);
}

export async function setStaffServices(staffId: string, serviceIds: string[]) {
    return staff.setStaffServices(staffId, serviceIds);
}

export async function replaceStaffHours(staffId: string, hours: WeeklyRange[]) {
    return staff.replaceStaffHours(staffId, hours);
}

export async function addExtraHours(
    staffId: string,
    input: { date: string; startMinute: number; endMinute: number },
) {
    return staff.addExtraHours(staffId, input);
}

export async function removeExtraHours(staffId: string, extraHoursId: string) {
    return staff.removeExtraHours(staffId, extraHoursId);
}

export async function addTimeOff(staffId: string, input: staff.TimeOffInput) {
    return staff.addTimeOff(staffId, input);
}

export async function removeTimeOff(staffId: string, timeOffId: string) {
    return staff.removeTimeOff(staffId, timeOffId);
}

export async function removeTimeOffMany(staffId: string, ids: string[]) {
    return staff.removeTimeOffMany(staffId, ids);
}

export async function addClosure(input: OffRangeInput & { reason?: string }) {
    return staff.addClosure(input);
}

export async function removeClosures(ids: string[]) {
    return staff.removeClosures(ids);
}

export async function previewOff(input: OffRangeInput & { staffId?: string }) {
    return staff.previewOff(input);
}

export async function updateBookingRules(input: Partial<BookingRules>) {
    return staff.updateBookingRules(input);
}
