"use server";

import type { BookingRules, WeeklyRange } from "./service";
import * as staff from "./service";

/**
 * Server Actions for staff, hours, time off and booking rules (U3). Thin
 * wrappers: the API resolves the caller and enforces `service:write`.
 */

export async function createStaff(input: staff.CreateStaffInput) {
    return staff.createStaff(input);
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

export async function updateBookingRules(input: Partial<BookingRules>) {
    return staff.updateBookingRules(input);
}
