"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";
import {
    chooseAccountCalendars,
    disconnectGoogleAccount,
    disconnectGoogleMember,
    listAccountCalendars,
    moveGoogleBookings,
    setBookingMeeting,
    setBusinessMeetAccess,
    startGoogleConnect,
} from "./service";

import type { MeetAccess } from "./types";

/**
 * Google Calendar's writes from the screens (DEC-233). Thin: the API asks
 * the switch, the plan and the permission of each. From Settings › Google
 * Calendar on React Query (DEC-259) a write takes the tab's business last
 * (`writeAsOrg`).
 */

const as = <R>(orgId: string | undefined, write: () => Promise<R>) =>
    orgId ? writeAsOrg(orgId, write) : write();

export async function connectGoogle() {
    return startGoogleConnect();
}

export async function accountCalendars(accountId: string) {
    return listAccountCalendars(accountId);
}

export async function saveAccountCalendars(
    accountId: string,
    choice: { writeTo?: string | null; checkBusy: string[] },
    orgId?: string,
) {
    return as(orgId, () => chooseAccountCalendars(accountId, choice));
}

export async function disconnectAccount(accountId: string, orgId?: string) {
    return as(orgId, () => disconnectGoogleAccount(accountId));
}

/** From Team on React Query, with the tab's business last (`writeAsOrg`). */
export async function disconnectMember(membershipId: string, orgId?: string) {
    return orgId
        ? writeAsOrg(orgId, () => disconnectGoogleMember(membershipId))
        : disconnectGoogleMember(membershipId);
}

export async function moveMyBookings(orgId?: string) {
    return as(orgId, () => moveGoogleBookings());
}

export async function saveBusinessMeetAccess(
    meetAccess: MeetAccess,
    orgId?: string,
) {
    return as(orgId, () => setBusinessMeetAccess(meetAccess));
}

export async function saveBookingMeeting(
    bookingId: string,
    input: {
        meetingLink?: "GOOGLE_MEET" | "MANUAL" | "NONE";
        meetingUrl?: string;
        meetAccess?: MeetAccess | null;
    },
    orgId?: string,
) {
    if (orgId)
        return writeAsOrg(orgId, () => setBookingMeeting(bookingId, input));
    return setBookingMeeting(bookingId, input);
}
