"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "./control-plane";

/** Invite a batch off the waitlist. The API claims, sends and records each. */
export async function inviteWaitlistAction(input: {
    ids: string[];
    reason: string;
    idempotencyKey: string;
}) {
    const result = await adminWrite<{
        sent: number;
        alreadyInvited: number;
        failed: number;
        notFound: number;
    }>("/waitlist/invite", "POST", input, "Could not send the invitations.");
    if (result.ok) revalidatePath("/waitlist");
    return result;
}

/** Remove one person from the waitlist because they asked (U30, KTD-17). */
export async function removeFromWaitlistAction(input: {
    id: string;
    reason: string;
    idempotencyKey: string;
}) {
    const { id, ...body } = input;
    const result = await adminWrite<{ removed: boolean }>(
        `/waitlist/${encodeURIComponent(id)}/remove`,
        "POST",
        body,
        "Could not remove them from the waitlist.",
    );
    if (result.ok) revalidatePath("/waitlist");
    return result;
}
