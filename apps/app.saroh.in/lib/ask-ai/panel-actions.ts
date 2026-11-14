"use server";

import type {
    AskAiConversation,
    AskAiConversationList,
    AskAiLanguage,
    AskAiState,
} from "@saroh/api-contract";
import { askAiConfirmBody, askAiLanguage } from "@saroh/api-contract";

import type { CrmResult } from "@/lib/api/http";
import type { AskAiReportBody } from "./panel-service";
import {
    askAiReportBody,
    confirmAskAiDraft,
    redraftAskAiDraft,
    reportAskAiAnswer,
    requestMoreAskAi,
    undoAskAiDraft,
} from "./panel-service";
import {
    getAskAiConversation,
    getAskAiState,
    listAskAiConversations,
    setAskAiLanguage,
    setAskAiOn,
} from "./service";

/**
 * The Ask AI panel's server actions (plan 2026-11-13-001 U10). Reads
 * answer null when they couldn't be made: the panel says so in place.
 * Everything a browser sends is checked here before it reaches the API.
 */

const INVALID = { ok: false as const, error: "That wasn't sent. Try again." };

async function orNull<T>(read: () => Promise<T | null>): Promise<T | null> {
    try {
        return await read();
    } catch {
        return null;
    }
}

export async function readAskAiState(): Promise<AskAiState | null> {
    return orNull(getAskAiState);
}

export async function readAskAiConversations(
    cursor?: string,
): Promise<AskAiConversationList | null> {
    return orNull(() => listAskAiConversations(cursor));
}

export async function readAskAiConversation(
    id: string,
): Promise<AskAiConversation | null> {
    return orNull(() => getAskAiConversation(id));
}

export async function changeAskAiLanguage(language: AskAiLanguage) {
    const parsed = askAiLanguage.safeParse(language);
    if (!parsed.success) return INVALID;
    return setAskAiLanguage(parsed.data);
}

/** Turn on, from the panel's off state (Owner and Admin; the API checks). */
export async function turnOnAskAi() {
    return setAskAiOn(true);
}

export async function askForMoreQuestions() {
    return requestMoreAskAi();
}

export async function sendAskAiReport(
    body: AskAiReportBody,
): Promise<CrmResult<{ id: string }>> {
    const parsed = askAiReportBody.safeParse(body);
    if (!parsed.success) return INVALID;
    return reportAskAiAnswer(parsed.data);
}

export async function confirmDraft(
    draftId: string,
    fields?: Record<string, unknown>,
) {
    const parsed = askAiConfirmBody.safeParse({ fields });
    if (!parsed.success || !draftId) return INVALID;
    return confirmAskAiDraft(draftId, parsed.data);
}

export async function undoDraft(draftId: string) {
    if (!draftId) return INVALID;
    return undoAskAiDraft(draftId);
}

export async function redraftDraft(draftId: string) {
    if (!draftId) return INVALID;
    return redraftAskAiDraft(draftId);
}
