import { cookies } from "next/headers";

import { apiBase } from "@/lib/api";

import type { StaffInvitePreview, StaffInviteRead } from "./staff-invite-words";
import {
    STAFF_INVITE_COOKIE,
    STAFF_INVITE_TOKEN_PATTERN,
} from "./staff-invite-words";

/**
 * A staff invite, read on accounts' server (admin console U24). Server-only:
 * the token lives in an httpOnly cookie no script on the page can read, and
 * goes to the API in a request body, never a path or a query string.
 */

/** The token from the swap cookie, or null when there is none worth sending. */
export async function staffInviteToken(): Promise<string | null> {
    const value = (await cookies()).get(STAFF_INVITE_COOKIE)?.value;
    return value && STAFF_INVITE_TOKEN_PATTERN.test(value) ? value : null;
}

/**
 * Which {@link StaffInviteRead} the API's answer is: a 404 is its one
 * answer for an invite that can't be shown; anything else that isn't a
 * success means it didn't answer the question.
 */
export function staffInviteReadStatus(
    status: number,
): StaffInviteRead["status"] {
    if (status >= 200 && status < 300) return "found";
    if (status === 404 || status === 400) return "gone";
    return "unreachable";
}

/** What the link's holder may see. Never cached: a withdrawn invite stops opening. */
export async function readStaffInvite(token: string): Promise<StaffInviteRead> {
    try {
        const response = await fetch(
            `${apiBase()}/public/staff-invites/preview`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token }),
                cache: "no-store",
            },
        );
        const status = staffInviteReadStatus(response.status);
        if (status !== "found") return { status };
        return {
            status,
            invite: (await response.json()) as StaffInvitePreview,
        };
    } catch {
        return { status: "unreachable" };
    }
}
