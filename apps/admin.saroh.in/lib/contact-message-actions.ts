"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "./control-plane";

/**
 * Mark a message from saroh.in/contact handled, or open again (admin audit
 * F12). The reply itself goes from the team's mailbox (DEC-137); this only
 * records that someone did, so the rest of the team can see it.
 */
export async function markContactMessageAction(input: {
    id: string;
    handled: boolean;
}) {
    const result = await adminWrite<{ id: string; handledAt: string | null }>(
        `/contact-messages/${encodeURIComponent(input.id)}/handled`,
        "POST",
        { handled: input.handled },
        "Could not change the message.",
    );
    if (result.ok) revalidatePath("/messages");
    return result;
}
