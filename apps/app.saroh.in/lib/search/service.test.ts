/**
 * The palette's read: a search that couldn't be read says so (`failed`),
 * and is never handed back as "found nothing".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn<(path: string) => Promise<Response>>();
const orgBase = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/api/http", () => ({
    apiFetch: (path: string) => apiFetch(path),
    orgBase: () => orgBase(),
}));

import { searchWorkspace } from "./service";

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });

describe("searchWorkspace", () => {
    beforeEach(() => {
        apiFetch.mockReset();
        orgBase.mockReset();
        orgBase.mockResolvedValue("/organizations/org_1");
    });

    it("asks the business's search, and hands back what it found", async () => {
        const hits = [
            {
                kind: "invoice",
                id: "i_1",
                title: "INV-0042",
                subtitle: null,
                href: "/billing/invoices/i_1",
            },
        ];
        apiFetch.mockResolvedValue(json(200, { query: "inv", hits }));
        expect(await searchWorkspace(" inv ")).toEqual({ query: "inv", hits });
        expect(apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/search?q=inv",
        );
    });

    it("asks nothing for under two characters", async () => {
        expect(await searchWorkspace("a")).toEqual({ query: "a", hits: [] });
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it.each([
        ["the API answers 500", () => Promise.resolve(json(500, {}))],
        ["the API answers 403", () => Promise.resolve(json(403, {}))],
        ["the API can't be reached", () => Promise.reject(new Error("down"))],
        ["the answer isn't a search", () => Promise.resolve(json(200, {}))],
    ])("is failed, not empty, when %s", async (_, answer) => {
        apiFetch.mockImplementation(answer);
        expect(await searchWorkspace("asha")).toEqual({
            query: "asha",
            hits: [],
            failed: true,
        });
    });

    it("is failed when which business is open can't be read", async () => {
        orgBase.mockRejectedValue(new Error("down"));
        expect((await searchWorkspace("asha")).failed).toBe(true);
    });

    it("with no business open there is nothing to search, and nothing failed", async () => {
        orgBase.mockResolvedValue(null);
        expect(await searchWorkspace("asha")).toEqual({
            query: "asha",
            hits: [],
        });
    });
});
