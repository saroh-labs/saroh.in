"use server";

import { revalidatePath } from "next/cache";

import { parseSettingValue } from "./ask-ai-words";
import { adminWrite } from "./control-plane";

/**
 * Ask AI's console writes (DEC-220, U8). The API checks the permission,
 * the value against the key's schema and the reason, and writes the
 * ledger; these only forward.
 */

interface Reasoned {
    reason: string;
    idempotencyKey: string;
}

async function post(path: string, body: unknown, fallback: string) {
    const result = await adminWrite(path, "POST", body, fallback);
    if (result.ok) revalidatePath("/ask-ai", "layout");
    return result;
}

export async function setAiSettingAction(
    input: Reasoned & { key: string; value: string },
) {
    const { key, value, ...rest } = input;
    return post(
        `/ask-ai/settings/${encodeURIComponent(key)}`,
        { ...rest, value: parseSettingValue(value) },
        "Couldn't change the setting. Nothing was changed.",
    );
}

export async function setAiHaltAction(input: Reasoned & { halted: boolean }) {
    return post(
        "/ask-ai/halt",
        input,
        "Couldn't change the halt. Nothing was changed.",
    );
}

export async function decideAiRequestAction(
    input: Reasoned & { id: string; decision: "grant" | "decline" },
) {
    const { id, decision, ...body } = input;
    return post(
        `/ask-ai/requests/${encodeURIComponent(id)}/${decision}`,
        body,
        "Couldn't decide the request. Nothing was changed.",
    );
}

export async function resolveAiReportAction(input: Reasoned & { id: string }) {
    const { id, ...body } = input;
    return post(
        `/ask-ai/reports/${encodeURIComponent(id)}/resolve`,
        body,
        "Couldn't mark the report resolved.",
    );
}
