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
 * the switch, the plan and the permission of each.
 */

export async function connectGoogle() {
    return startGoogleConnect();
}

export async function accountCalendars(accountId: string) {
    return listAccountCalendars(accountId);
}

export async function saveAccountCalendars(
    accountId: string,
    choice: { writeTo?: string | null; checkBusy: string[] },
) {
    return chooseAccountCalendars(accountId, choice);
}

export async function disconnectAccount(accountId: string) {
    return disconnectGoogleAccount(accountId);
}

/** From Team on React Query, with the tab's business last (`writeAsOrg`). */
export async function disconnectMember(membershipId: string, orgId?: string) {
    return orgId
        ? writeAsOrg(orgId, () => disconnectGoogleMember(membershipId))
        : disconnectGoogleMember(membershipId);
}

export async function moveMyBookings() {
    return moveGoogleBookings();
}

export async function saveBusinessMeetAccess(meetAccess: MeetAccess) {
    return setBusinessMeetAccess(meetAccess);
}

export async function saveBookingMeeting(
    bookingId: string,
    input: {
        meetingLink?: "GOOGLE_MEET" | "MANUAL" | "NONE";
        meetingUrl?: string;
        meetAccess?: MeetAccess | null;
    },
) {
    return setBookingMeeting(bookingId, input);
}
