import type {
    AiOpsSummary,
    AiReportRow,
    AiReportView,
    AiRequestRow,
    AiSettingNow,
    AiSettingRecord,
} from "./ask-ai-words";
import { getJson } from "./control-plane";

/**
 * Ask AI's reads (DEC-220, U8). Server-only: it reads through
 * `control-plane`. Each is null when the API refuses it (403), and throws
 * on any other failure, so a panel can say it failed.
 */

export type Read<T> = { status: "ok"; data: T } | { status: "failed" };

/** A read as a panel takes it; a refusal is a failure here, the panel is hidden first. */
export async function read<T>(load: Promise<T | null>): Promise<Read<T>> {
    try {
        const data = await load;
        return data === null ? { status: "failed" } : { status: "ok", data };
    } catch {
        return { status: "failed" };
    }
}

export const readSummary = () => getJson<AiOpsSummary>("/ask-ai/summary");

export const readSettings = () => getJson<AiSettingNow[]>("/ask-ai/settings");

export const readSettingHistory = (key: string) =>
    getJson<AiSettingRecord[]>(
        `/ask-ai/settings/${encodeURIComponent(key)}/history`,
    );

export const readRequests = (status?: string) =>
    getJson<AiRequestRow[]>(
        `/ask-ai/requests${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    );

export const readReports = (status?: string) =>
    getJson<AiReportRow[]>(
        `/ask-ai/reports${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    );

/** One report, opened; the API puts the read on the ledger. */
export const readReport = (id: string) =>
    getJson<AiReportView>(`/ask-ai/reports/${encodeURIComponent(id)}`);
