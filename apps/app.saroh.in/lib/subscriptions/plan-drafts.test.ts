import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api/http", () => ({
    apiFetch: (path: string, init?: RequestInit) =>
        apiFetch(path, init) as unknown,
    orgBase: () => Promise.resolve("/organizations/org_1"),
}));

import {
    createPlanDraft,
    deletePlanDraft,
    loadPlanDraft,
    publishPlan,
    savePlanDraft,
} from "@/lib/subscriptions/plan-drafts";

function answer(status: number, body?: unknown): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
    });
}

const record = {
    id: "plan_1",
    status: "ACTIVE",
    hasPendingChanges: true,
    revision: 5,
    values: { price: "1500.00" },
    published: { price: "1200.00" },
    canDelete: false,
    problems: [],
    pendingChangedAt: "2026-10-14T10:00:00.000Z",
};

beforeEach(() => apiFetch.mockReset());

describe("the Plan Editor's calls (D5)", () => {
    it("autosaves the fields with the revision held, answering the record", async () => {
        apiFetch.mockResolvedValue(answer(200, record));
        const res = await savePlanDraft("plan_1", { price: "1500" }, 4);
        expect(apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/subscription-plans/plan_1/draft",
            {
                method: "PATCH",
                body: JSON.stringify({ price: "1500", revision: 4 }),
            },
        );
        expect(res).toEqual({ ok: true, data: record });
    });

    it("reads a stale revision's 409 as the shell's conflict, by name", async () => {
        apiFetch.mockResolvedValue(
            answer(409, {
                error: {
                    message:
                        "Priya changed this plan while you were editing. Reload to see it.",
                    details: {
                        yours: 4,
                        current: 5,
                        changedBy: "Priya",
                        changedAt: "2026-10-14T10:00:00.000Z",
                    },
                },
            }),
        );
        const res = await publishPlan("plan_1", 4);
        expect(res).toMatchObject({
            ok: false,
            conflict: {
                changedBy: "Priya",
                current: 5,
                changedAt: "2026-10-14T10:00:00.000Z",
            },
        });
    });

    it("reads a refusal on a field as that field, not a conflict", async () => {
        apiFetch.mockResolvedValue(
            answer(409, {
                error: {
                    message: "There is already a plan called Monthly.",
                    details: { field: "name" },
                },
            }),
        );
        const res = await publishPlan("plan_1", 5);
        expect(res).toEqual({
            ok: false,
            error: "There is already a plan called Monthly.",
            field: "name",
        });
    });

    it("creates a draft through its own route", async () => {
        apiFetch.mockResolvedValue(answer(201, { ...record, status: "DRAFT" }));
        await createPlanDraft({ name: "Unlimited" });
        expect(apiFetch.mock.calls[0]?.[0]).toBe(
            "/organizations/org_1/subscription-plans/drafts",
        );
    });

    it("deletes a draft with its revision in the query, answering nothing", async () => {
        apiFetch.mockResolvedValue(answer(204));
        const res = await deletePlanDraft("plan_1", 3);
        expect(apiFetch.mock.calls[0]?.[0]).toBe(
            "/organizations/org_1/subscription-plans/plan_1?revision=3",
        );
        expect(res).toEqual({ ok: true, data: null });
    });

    it("reads a plan for the editor from its draft route", async () => {
        apiFetch.mockResolvedValue(answer(200, record));
        expect(await loadPlanDraft("plan_1")).toEqual({
            ok: true,
            data: record,
        });
        expect(apiFetch.mock.calls[0]?.[0]).toBe(
            "/organizations/org_1/subscription-plans/plan_1/draft",
        );
    });
});
