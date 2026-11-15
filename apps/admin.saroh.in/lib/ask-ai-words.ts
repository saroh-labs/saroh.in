/**
 * Ask AI's console page (DEC-220, plan 2026-11-13-001 U8): the API's
 * shapes and the words for them. Client-safe: no server imports.
 */

export interface AiSettingRecord {
    id: string;
    key: string;
    value: unknown;
    reason: string;
    setByUserId: string;
    effectiveFrom: string;
    createdAt: string;
}

export interface AiSettingNow {
    key: string;
    current: AiSettingRecord | null;
}

export interface AiOpsSummary {
    halted: boolean;
    haltReason: string | null;
    spentTodayMicroUsd: number;
    spentThisMonthMicroUsd: number;
    lastHour: { finished: number; failed: number };
    today: { finished: number; failed: number };
    openRequests: number;
    openReports: number;
}

export type AiRequestStatus = "OPEN" | "GRANTED" | "DECLINED";

export interface AiRequestRow {
    id: string;
    organizationId: string;
    businessName: string;
    userId: string;
    windowKey: string;
    status: AiRequestStatus;
    reason: string | null;
    packs: number | null;
    packsEndAt: string | null;
    packsRemovedAt: string | null;
    createdAt: string;
    decidedAt: string | null;
}

export type AiReportReason =
    "WRONG_NUMBER" | "DIDNT_UNDERSTAND" | "SOMETHING_ELSE";

export interface AiReportRow {
    id: string;
    organizationId: string;
    businessName: string;
    reason: AiReportReason;
    status: "OPEN" | "RESOLVED";
    createdAt: string;
}

export interface AiReportView extends AiReportRow {
    userId: string;
    question: string;
    answer: string;
    note: string | null;
    resolvedAt: string | null;
}

export const REPORT_REASON_WORDS: Record<AiReportReason, string> = {
    WRONG_NUMBER: "A wrong number",
    DIDNT_UNDERSTAND: "Didn't understand the question",
    SOMETHING_ELSE: "Something else",
};

export const REQUEST_STATUS_WORDS: Record<AiRequestStatus, string> = {
    OPEN: "Waiting",
    GRANTED: "Granted",
    DECLINED: "Declined",
};

/** Millionths of a US dollar, as dollars and cents. */
export function dollarsOf(microUsd: number): string {
    return `$${(microUsd / 1_000_000).toFixed(2)}`;
}

/** A failed share in words: "3 of 40 (8%)", or "none" with nothing finished. */
export function failedWords(counts: {
    finished: number;
    failed: number;
}): string {
    if (counts.finished === 0) return "No questions finished";
    const share = Math.round((counts.failed / counts.finished) * 100);
    return `${counts.failed} of ${counts.finished} failed (${share}%)`;
}

/** A stored value as one line: JSON, but a string without its quotes. */
export function settingValueWords(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * What the operator typed, as the value to send: JSON when it reads as
 * JSON (true, 0.8, {"…": …}), else the text itself (a model id). The API
 * checks it against the key's schema either way.
 */
export function parseSettingValue(text: string): unknown {
    const t = text.trim();
    try {
        return JSON.parse(t) as unknown;
    } catch {
        return t;
    }
}
