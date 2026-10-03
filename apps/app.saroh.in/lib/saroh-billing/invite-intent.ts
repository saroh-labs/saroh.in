import { apiFetch } from "@/lib/api/http";

import type { InviteCheckAnswer, InviteIntent } from "./launch-offer";
import { INVITE_TOKEN, inviteIntentFrom } from "./launch-offer";

/**
 * The opening-day invite in onboarding's link (`?invite=`, plan U31), as
 * the API reads it for the signed-in account: ready (with the offer's plan
 * and length), or why not. Server-only.
 *
 * An API that can't be asked is not a reason to stop someone setting up:
 * the invite is tried once the business exists, and that answer is what
 * they're told.
 */
export async function readInviteIntent(query: {
    invite?: string | string[];
}): Promise<InviteIntent> {
    const raw = Array.isArray(query.invite) ? query.invite[0] : query.invite;
    const token = raw?.trim();
    if (!token) return { kind: "none" };
    if (!INVITE_TOKEN.test(token)) {
        return inviteIntentFrom(token, {
            status: "invalid",
            message: "This invite link isn't valid. Ask for a new invite.",
        });
    }
    try {
        const res = await apiFetch("/waitlist/invite/check", {
            method: "POST",
            body: JSON.stringify({ token }),
        });
        if (!res.ok) return inviteIntentFrom(token, null);
        return inviteIntentFrom(
            token,
            (await res.json()) as InviteCheckAnswer | null,
        );
    } catch {
        return inviteIntentFrom(token, null);
    }
}
