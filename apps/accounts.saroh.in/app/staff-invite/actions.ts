"use server";

import { cookies, headers } from "next/headers";

import { apiWrite } from "@/lib/api";
import { staffInviteToken } from "@/lib/staff-invite";
import type { StaffInviteAcceptResult } from "@/lib/staff-invite-words";
import {
    acceptResult,
    doneAfterAccept,
    STAFF_INVITE_COOKIE,
    STAFF_INVITE_DONE_COOKIE,
    STAFF_INVITE_DONE_MAX_AGE_SECONDS,
    STAFF_INVITE_PATH,
} from "@/lib/staff-invite-words";

/**
 * Accept the staff invite in this browser's cookie, as the signed-in person
 * (admin console U24). The token goes to the API in the body; the API
 * decides everything (the address, whose word verified it, the sender's
 * reach). Once the invite is over for this person (joined, already on the
 * team, or it can't be used) the cookie goes too, so nothing holds a spent
 * token. What it ended as stays for a few minutes in its place
 * (`STAFF_INVITE_DONE_COOKIE`): deleting a cookie reloads the page, which
 * then says it from there.
 */
export async function acceptStaffInviteAction(): Promise<StaffInviteAcceptResult> {
    const token = await staffInviteToken();
    if (!token) {
        return acceptResult({
            ok: false,
            status: 404,
            error: "",
            code: "INVITE_GONE",
        });
    }
    const answer = await apiWrite<{ outcome: string }>(
        "POST",
        "/staff-invites/accept",
        { token },
    );
    const result = acceptResult(answer.ok ? { ok: true } : answer);
    const done = doneAfterAccept(answer.ok ? { ok: true } : answer);
    if (done) {
        const jar = await cookies();
        jar.delete({ name: STAFF_INVITE_COOKIE, path: STAFF_INVITE_PATH });
        jar.set(STAFF_INVITE_DONE_COOKIE, done, {
            httpOnly: true,
            // Over https, as the invite's own cookie (`open/route.ts`).
            secure: (await headers()).get("origin")?.startsWith("https:"),
            sameSite: "lax",
            path: STAFF_INVITE_PATH,
            maxAge: STAFF_INVITE_DONE_MAX_AGE_SECONDS,
        });
    }
    return result;
}
