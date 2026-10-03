"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "./control-plane";

// Opening-day invites (U31) are a bulk operation: `BulkAction` with the
// kind `waitlist.invite` (`machinery-actions.ts`), dry run first.

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
