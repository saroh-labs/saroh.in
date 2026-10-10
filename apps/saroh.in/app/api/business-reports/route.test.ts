import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
    env: {
        API_URL: "https://api.example.test",
        SITE_RELAY_SECRET: undefined,
        NODE_ENV: "test",
    },
}));

import { POST } from "./route";

/** /customers' report relay (Terms rev 46): three fields go on, no more. */

const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});

const upstream = (status: number) => ({
    ok: status < 400,
    status,
    json: () => Promise.resolve({ ok: true }),
});

const report = (body: unknown) =>
    new Request("https://www.saroh.in/api/business-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

const GOOD = {
    site: "rye.saroh.app",
    message: "Paid for a cake that never came.",
};

describe("POST /api/business-reports", () => {
    it("forwards the address, the message and an email, and nothing else", async () => {
        fetchMock.mockResolvedValue(upstream(200));
        const res = await POST(
            report({ ...GOOD, email: "me@example.com", organizationId: "x" }),
        );
        expect(await res.json()).toEqual({ sent: true });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.example.test/public/business-reports");
        expect(JSON.parse(init.body as string)).toEqual({
            ...GOOD,
            email: "me@example.com",
        });
    });

    it("refuses a report with no address without calling the API", async () => {
        const res = await POST(report({ site: "", message: "x" }));
        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        [429, "rate-limited"],
        [400, "site"],
        [500, "unavailable"],
    ] as const)("answers the API's %s as %s", async (status, failure) => {
        fetchMock.mockResolvedValue(upstream(status));
        const res = await POST(report(GOOD));
        expect(await res.json()).toEqual({ sent: false, failure });
    });
});
