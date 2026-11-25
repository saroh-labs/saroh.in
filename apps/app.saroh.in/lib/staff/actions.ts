"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";
import type { ApiResult } from "@/lib/api/failure";
import { listServices } from "@/lib/services/service";

import type {
    AddedSelf,
    BookingRules,
    OfferedRead,
    OffRangeInput,
    RuleChanges,
    WeeklyRange,
} from "./service";
import * as staff from "./service";
import { hasOpening, startingWeek } from "./starting-week";

/**
 * Server Actions for staff, hours, time off and booking rules (U3). Thin
 * wrappers: the API resolves the caller and enforces `service:write`.
 * From a React Query screen (DEC-259) each takes the tab's business last
 * (`orgId`) and refuses when it is no longer the open one (`writeAsOrg`).
 */

function asOrg<R>(orgId: string | undefined, write: () => Promise<R>) {
    return orgId ? writeAsOrg(orgId, write) : write();
}

export async function createStaff(
    input: staff.CreateStaffInput,
    orgId?: string,
) {
    return asOrg(orgId, () => staff.createStaff(input));
}

/**
 * Someone new on the diary, starting with the business's opening hours as
 * their weekly hours (the default week when none are saved, or when they
 * couldn't be read), so nobody starts with an empty week.
 */
export async function addPerson(
    input: { name: string; title?: string },
    orgId?: string,
) {
    return asOrg(orgId, async () => {
        const opening = await staff.readOpeningHours();
        return staff.createStaff({ ...input, hours: startingWeek(opening) });
    });
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
    orgId?: string,
): Promise<ApiResult<AddedSelf>> {
    return asOrg(orgId, () => addSelfWithWeek(hours));
}

async function addSelfWithWeek(
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
    orgId?: string,
) {
    return asOrg(orgId, () => staff.updateStaff(staffId, input));
}

export async function setTeamPage(staffIds: string[], orgId?: string) {
    return asOrg(orgId, () => staff.setTeamPage(staffIds));
}

export async function setStaffServices(
    staffId: string,
    serviceIds: string[],
    orgId?: string,
) {
    return asOrg(orgId, () => staff.setStaffServices(staffId, serviceIds));
}

export async function replaceStaffHours(
    staffId: string,
    hours: WeeklyRange[],
    orgId?: string,
) {
    return asOrg(orgId, () => staff.replaceStaffHours(staffId, hours));
}

export async function addExtraHours(
    staffId: string,
    input: { date: string; startMinute: number; endMinute: number },
    orgId?: string,
) {
    return asOrg(orgId, () => staff.addExtraHours(staffId, input));
}

export async function removeExtraHours(
    staffId: string,
    extraHoursId: string,
    orgId?: string,
) {
    return asOrg(orgId, () => staff.removeExtraHours(staffId, extraHoursId));
}

export async function addTimeOff(
    staffId: string,
    input: staff.TimeOffInput,
    orgId?: string,
) {
    return asOrg(orgId, () => staff.addTimeOff(staffId, input));
}

export async function removeTimeOff(
    staffId: string,
    timeOffId: string,
    orgId?: string,
) {
    return asOrg(orgId, () => staff.removeTimeOff(staffId, timeOffId));
}

export async function removeTimeOffMany(
    staffId: string,
    ids: string[],
    orgId?: string,
) {
    return asOrg(orgId, () => staff.removeTimeOffMany(staffId, ids));
}

export async function addClosure(
    input: OffRangeInput & { reason?: string },
    orgId?: string,
) {
    return asOrg(orgId, () => staff.addClosure(input));
}

export async function removeClosures(ids: string[], orgId?: string) {
    return asOrg(orgId, () => staff.removeClosures(ids));
}

export async function previewOff(
    input: OffRangeInput & { staffId?: string },
    orgId?: string,
) {
    return asOrg(orgId, () => staff.previewOff(input));
}

export async function saveStaffProfile(
    staffId: string,
    changes: { photoMediaId?: string | null; about?: string | null },
    orgId?: string,
) {
    return asOrg(orgId, () => staff.updateStaffProfile(staffId, changes));
}

export async function updateBookingRules(
    input: Partial<BookingRules>,
    orgId?: string,
) {
    return asOrg(orgId, () => staff.updateBookingRules(input));
}

export async function updatePersonRules(
    staffId: string,
    input: RuleChanges,
    orgId?: string,
) {
    return asOrg(orgId, () => staff.updatePersonRules(staffId, input));
}

export async function approveRuleRequest(requestId: string, orgId?: string) {
    return asOrg(orgId, () => staff.moveRuleRequest(requestId, "approve"));
}

export async function turnDownRuleRequest(
    requestId: string,
    reason?: string,
    orgId?: string,
) {
    return asOrg(orgId, () =>
        staff.moveRuleRequest(requestId, "turn-down", reason),
    );
}

export async function withdrawRuleRequest(requestId: string, orgId?: string) {
    return asOrg(orgId, () => staff.moveRuleRequest(requestId, "withdraw"));
}

export async function dismissRuleRequest(requestId: string, orgId?: string) {
    return asOrg(orgId, () => staff.moveRuleRequest(requestId, "dismiss"));
}
