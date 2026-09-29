import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
    apiFetch: vi.fn(),
    getJson: vi.fn<(url: string) => Promise<unknown>>(),
}));
vi.mock("@/lib/api/http", () => ({
    apiFetch: http.apiFetch,
    getJson: http.getJson,
    orgBase: () => Promise.resolve("/organizations/org_1"),
}));

import { readPlanEditor } from "@/lib/subscriptions/plan-drafts";
import { listPlans, listPlansOptional } from "@/lib/subscriptions/service";

beforeEach(() => {
    http.apiFetch.mockReset();
    http.getJson.mockReset();
});

describe("the plan reads the Plan Editor relies on (D7)", () => {
    it("the Plans tab asks for drafts too, which the API leaves out unless asked", async () => {
        http.apiFetch.mockResolvedValue(new Response("[]", { status: 200 }));
        await listPlansOptional();
        expect(http.apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/subscription-plans?include=drafts",
        );
    });

    it("every other list still reads plans on sale and archived only", async () => {
        http.getJson.mockResolvedValue([]);
        await listPlans();
        await listPlans({ drafts: true });
        expect(http.getJson.mock.calls.map((c) => c[0])).toEqual([
            "/organizations/org_1/subscription-plans",
            "/organizations/org_1/subscription-plans?include=drafts",
        ]);
    });

    it("the editor page reads a plan from its draft route; a missing one is null", async () => {
        http.getJson.mockResolvedValue(null);
        expect(await readPlanEditor("plan_9")).toBeNull();
        expect(http.getJson).toHaveBeenCalledWith(
            "/organizations/org_1/subscription-plans/plan_9/draft",
        );
    });
});
