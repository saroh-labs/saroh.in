import { getJson } from "./control-plane";

/** The machinery behind the instance, as the console reads it (plan U7–U9). Server-only. */

export type CheckState = "ok" | "warn" | "failed" | "unmeasured";

export interface HealthCheck {
    key: string;
    label: string;
    state: CheckState;
    summary: string;
    action?: { label: string; href: string };
}

export interface HealthBoard {
    checkedAt: string;
    checks: HealthCheck[];
}

export interface QueueSummary {
    pending: number;
    processing: number;
    failed: number;
    done: number;
    doneLastDay: number;
    failedLastDay: number;
    oldestDueSeconds: number;
    failedByType: { type: string; count: number }[];
}

export interface JobRow {
    id: string;
    type: string;
    status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
    attempts: number;
    maxAttempts: number;
    runAt: string;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
    processedAt: string | null;
    organization: { id: string; name: string } | null;
}

export interface WebhookRow {
    id: string;
    provider: string;
    providerEventId: string;
    eventType: string;
    status: "RECEIVED" | "PROCESSED" | "FAILED" | "IGNORED";
    error: string | null;
    createdAt: string;
    processedAt: string | null;
    organization: { id: string; name: string } | null;
}

export interface Page<T> {
    items: T[];
    nextCursor?: string;
}

export interface ProviderRollup {
    payments: { provider: string; status: string; count: number }[];
    messaging: {
        channel: string;
        provider: string;
        status: string;
        count: number;
    }[];
    domains: { status: string; count: number }[];
    waitingDomains: {
        id: string;
        hostname: string;
        status: string;
        lastCheckedAt: string | null;
        lastCheckResult: string | null;
        createdAt: string;
        organization: { id: string; name: string };
    }[];
}

export interface OperationSummary {
    id: string;
    kind: "jobs.retry" | "webhooks.replay";
    status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
    actorUserId: string;
    reason: string;
    total: number;
    succeeded: number;
    skipped: number;
    failed: number;
    createdAt: string;
    startedAt?: string | null;
    finishedAt: string | null;
}

export interface OperationDetail extends OperationSummary {
    items: {
        targetId: string;
        status: "PENDING" | "RUNNING" | "DONE" | "SKIPPED" | "FAILED";
        detail: string | null;
        processedAt: string | null;
    }[];
}

function query(params: Record<string, string | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value);
    }
    return search.size > 0 ? `?${search.toString()}` : "";
}

export const getHealth = () => getJson<HealthBoard>("/health");
export const getQueue = () => getJson<QueueSummary>("/jobs/queue");
export const listJobs = (params: Record<string, string | undefined>) =>
    getJson<Page<JobRow>>(`/jobs${query(params)}`);
export const getWebhookSummary = () =>
    getJson<{
        total: Partial<Record<string, number>>;
        lastDay: Partial<Record<string, number>>;
    }>("/webhooks/summary");
export const listWebhooks = (params: Record<string, string | undefined>) =>
    getJson<Page<WebhookRow>>(`/webhooks${query(params)}`);
export const getProviders = () => getJson<ProviderRollup>("/providers");
export const listOperations = () => getJson<OperationSummary[]>("/operations");
export const getOperation = (id: string) =>
    getJson<OperationDetail>(`/operations/${encodeURIComponent(id)}`);
