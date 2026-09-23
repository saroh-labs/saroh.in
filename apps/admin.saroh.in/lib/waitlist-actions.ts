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
