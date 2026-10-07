import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
    apiFetch: vi.fn(),
    orgBase: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("@/lib/api/http", () => ({
    apiFetch: http.apiFetch,
    destroy: vi.fn(),
    mutate: vi.fn(),
    orgBase: http.orgBase,
}));
const nav = vi.hoisted(() => ({
    forbidden: vi.fn(() => {
        throw new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    }),
}));
vi.mock("next/navigation", () => ({ forbidden: nav.forbidden }));

import { listLeads } from "@/lib/leads/service";
import { listPipelines } from "@/lib/pipelines/service";

const status = (code: number, body: unknown = []) =>
    new Response(JSON.stringify(body), { status: code });

beforeEach(() => {
    http.apiFetch.mockReset();
    nav.forbidden.mockClear();
    http.orgBase.mockResolvedValue("/organizations/org_1");
});

/**
 * UX-027: a role without leads or pipelines got "Leads appear here as
 * enquiries come in" and "No pipeline yet" — a refusal drawn as an empty
 * business. A 403 is the shell's "You do not have access" now.
 */
describe("leads and pipelines a role can't reach", () => {
    it.each([
        ["leads", () => listLeads()],
        ["pipelines", () => listPipelines()],
    ])(
        "a 403 on %s is the role's answer, not an empty list",
        async (_, read) => {
            http.apiFetch.mockResolvedValue(status(403, { message: "No" }));
            await expect(read()).rejects.toThrow(/403/);
            expect(nav.forbidden).toHaveBeenCalledTimes(1);
        },
    );

    it.each([
        ["leads", () => listLeads()],
        ["pipelines", () => listPipelines()],
    ])("%s the role reaches still read as before", async (_, read) => {
        http.apiFetch.mockResolvedValue(status(200, [{ id: "x" }]));
        expect(await read()).toEqual([{ id: "x" }]);
        http.apiFetch.mockResolvedValue(status(500));
        expect(await read()).toEqual([]);
        expect(nav.forbidden).not.toHaveBeenCalled();
    });
});
