"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "./control-plane";

/** Mark a customer's report done: looked into, acted on or nothing to do. */
export async function markBusinessReportDoneAction(input: {
    id: string;
    reason: string;
    idempotencyKey: string;
}) {
    const { id, ...body } = input;
    const result = await adminWrite<{ id: string; status: "DONE" }>(
        `/business-reports/${encodeURIComponent(id)}/done`,
        "POST",
        body,
        "Could not mark the report done.",
    );
    if (result.ok) revalidatePath("/reports");
    return result;
}
