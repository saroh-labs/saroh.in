import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
    env: {
        API_URL: "https://api.example.test",
        SITE_RELAY_SECRET: undefined,
        NODE_ENV: "test",
    },
}));

import { POST } from "./route";

/**
 * /customers' report relay (Terms rev 46): four fields go on, no more, and
 * nothing goes without the reporter's email and mobile number (DEC-138).
 */

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
    email: "first.last@example.com",
    phone: "+91 98450 12345",
};

describe("POST /api/business-reports", () => {
    it("forwards the address, the message, the email and the number, and nothing else", async () => {
        fetchMock.mockResolvedValue(upstream(200));
        const res = await POST(
            report({
                ...GOOD,
                email: " first.last@example.com ",
                phone: " +91 98450 12345 ",
                organizationId: "x",
            }),
        );
        expect(await res.json()).toEqual({ sent: true });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.example.test/public/business-reports");
        expect(JSON.parse(init.body as string)).toEqual(GOOD);
    });

    it.each([
        ["no address", { ...GOOD, site: "" }, "site"],
        ["a short message", { ...GOOD, message: "x" }, "message"],
        ["no email", { ...GOOD, email: undefined }, "email"],
        ["a bad email", { ...GOOD, email: "first.last" }, "email"],
        ["no mobile number", { ...GOOD, phone: undefined }, "phone"],
        ["a blank mobile number", { ...GOOD, phone: "  " }, "phone"],
        ["a bad mobile number", { ...GOOD, phone: "call me" }, "phone"],
        ["a number that isn't text", { ...GOOD, phone: 9845012345 }, "phone"],
        ["nothing at all", null, "site"],
    ] as const)(
        "refuses a report with %s, naming the field, without calling the API",
        async (_what, body, failure) => {
            const res = await POST(report(body));
            expect(res.status).toBe(400);
            expect(await res.json()).toEqual({ sent: false, failure });
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

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
