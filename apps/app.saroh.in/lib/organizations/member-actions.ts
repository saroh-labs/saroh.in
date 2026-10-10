"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { ACTIVE_ORG_COOKIE } from "@/lib/api/http";

import {
    ACTIVE_ORG_NAME_COOKIE,
    ACTIVE_ORG_USER_COOKIE,
} from "./left-business";

import type { InviteMemberInput } from "./members";
import {
    dismissStorefrontTeamNotice as dismissStorefrontTeamNoticeApi,
    inviteMember as inviteMemberApi,
    leaveBusiness as leaveBusinessApi,
    removeMember as removeMemberApi,
    revokeInvitation as revokeInvitationApi,
    setMemberExtraActions as setMemberExtraActionsApi,
    updateMemberRole as updateMemberRoleApi,
} from "./members";

/**
 * Server Actions for the organization roster (#276).
 *
 * Thin wrappers, as everywhere else: the API resolves the caller from the
 * session and decides what their role may do. Nothing here is a permission
 * check — the members screen hides what it can, and the API refuses it.
 */

/**
 * Team, read again with the action's answer (UX-028): the new invite or
 * change shows at once. `router.refresh()` after the action alone left
 * "No one else yet" on screen until a reload.
 */
const TEAM_PATH = "/settings/people";

export async function inviteMember(input: InviteMemberInput) {
    const res = await inviteMemberApi(input);
    if (res.ok) revalidatePath(TEAM_PATH);
    return res;
}

/** Revalidates the layout: someone's role decides what their rail shows. */
export async function updateMemberRole(
    userId: string,
    input: { role: string; siteIds?: string[] },
) {
    const res = await updateMemberRoleApi(userId, input);
    if (res.ok) revalidatePath("/", "layout");
    return res;
}

/**
 * A person's extra permissions (F17). Revalidates the layout: what someone
 * holds decides what their rail shows.
 */
export async function setMemberExtraActions(userId: string, actions: string[]) {
    const res = await setMemberExtraActionsApi(userId, actions);
    if (res.ok) revalidatePath("/", "layout");
    return res;
}

export async function removeMember(userId: string) {
    const res = await removeMemberApi(userId);
    if (res.ok) revalidatePath(TEAM_PATH);
    return res;
}

/**
 * Leave the active business. Once it is done the business is forgotten as
 * the one that was open: left there, the cookie would name a business the
 * person is no longer in, and the next screen would tell them someone had
 * removed them (`left-business.ts`). They left; nobody removed them.
 */
export async function leaveBusiness() {
    const res = await leaveBusinessApi();
    if (res.ok) {
        const jar = await cookies();
        jar.delete(ACTIVE_ORG_COOKIE);
        jar.delete(ACTIVE_ORG_NAME_COOKIE);
        jar.delete(ACTIVE_ORG_USER_COOKIE);
    }
    return res;
}

export async function revokeInvitation(invitationId: string) {
    const res = await revokeInvitationApi(invitationId);
    if (res.ok) revalidatePath(TEAM_PATH);
    return res;
}

/** Team's storefront-people notice, dismissed for the business (F16). */
export async function dismissStorefrontTeamNotice() {
    return dismissStorefrontTeamNoticeApi();
}
