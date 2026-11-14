import type {
    AskAiConfirmBody,
    AskAiDraftResult,
    AskAiHandOff,
} from "@saroh/api-contract";
import { z } from "zod";

import type { CrmResult } from "@/lib/api/http";
import { mutate } from "@/lib/api/http";

/**
 * Ask AI's panel writes besides the question (plan 2026-11-13-001 U10):
 * a draft's Confirm, Undo and Draft again, Request more, and Report this
 * answer. Server-only, under `organizations/:org/ask-ai`.
 */

const draftPath = (draftId: string, verb: string) =>
    `/ask-ai/drafts/${encodeURIComponent(draftId)}/${verb}`;

export function confirmAskAiDraft(
    draftId: string,
    body: AskAiConfirmBody,
): Promise<CrmResult<AskAiDraftResult>> {
    return mutate(
        draftPath(draftId, "confirm"),
        "POST",
        body,
        "That wasn't saved. Try again.",
    );
}

export function undoAskAiDraft(
    draftId: string,
): Promise<CrmResult<AskAiDraftResult>> {
    return mutate(
        draftPath(draftId, "undo"),
        "POST",
        {},
        "That wasn't undone. Try again.",
    );
}

export function redraftAskAiDraft(
    draftId: string,
): Promise<CrmResult<AskAiDraftResult>> {
    return mutate(
        draftPath(draftId, "redraft"),
        "POST",
        {},
        "That wasn't drafted again. Try again.",
    );
}

/** Open in editor: marks a blog draft handed off; answers its website. */
export function handOffAskAiDraft(
    draftId: string,
): Promise<CrmResult<AskAiHandOff>> {
    return mutate(
        draftPath(draftId, "hand-off"),
        "POST",
        {},
        "That didn't open. Try again.",
    );
}

export function requestMoreAskAi(): Promise<CrmResult<{ id: string }>> {
    return mutate(
        "/ask-ai/request-more",
        "POST",
        {},
        "The request wasn't sent. Try again.",
    );
}

/**
 * Report this answer's body, as the API's `AiReportDto` checks it
 * (`ai-reports.controller.ts`): one of the asker's own answers, a reason,
 * an optional note.
 */
export const askAiReportBody = z.strictObject({
    messageId: z.string().min(1).max(64),
    reason: z.enum(["WRONG_NUMBER", "DIDNT_UNDERSTAND", "SOMETHING_ELSE"]),
    note: z.string().trim().max(1000).optional(),
});
export type AskAiReportBody = z.infer<typeof askAiReportBody>;

export function reportAskAiAnswer(
    body: AskAiReportBody,
): Promise<CrmResult<{ id: string }>> {
    return mutate(
        "/ask-ai/reports",
        "POST",
        body,
        "The report wasn't sent. Try again.",
    );
}
