import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(
    (): {
        API_URL: string | undefined;
        SITE_RELAY_SECRET: undefined;
        NODE_ENV: string;
    } => ({
        API_URL: "https://api.example.test",
        SITE_RELAY_SECRET: undefined,
        NODE_ENV: "test",
    }),
);
vi.mock("@/env", () => ({ env }));

import { POST } from "./route";

/**
 * /contact's relay (DEC-137): five fields go on, no more; it never says
 * "sent" for a message the API did not take; and nothing a visitor typed
 * reaches a log.
 */

const fetchMock = vi.fn();
const logged: string[] = [];

beforeEach(() => {
    env.API_URL = "https://api.example.test";
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
    });
});
afterEach(() => {
    fetchMock.mockReset();
    logged.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const upstream = (status: number) => ({
    ok: status < 400,
    status,
    json: () => Promise.resolve({ ok: true }),
});

const message = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("https://www.saroh.in/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });

const GOOD = {
    topic: "question",
    name: "Asha Rao",
    email: "asha.rao@example.com",
    message: "Can I take bookings for two branches?",
};

describe("POST /api/contact", () => {
    it("forwards the topic, name, email, kind and message, and nothing else", async () => {
        fetchMock.mockResolvedValue(upstream(200));
        const res = await POST(
            message({ ...GOOD, kind: "salon", organizationId: "x" }),
        );
        expect(await res.json()).toEqual({ sent: true });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.example.test/public/contact-messages");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({
            ...GOOD,
            kind: "salon",
        });
    });

    it("signs the visitor's address for the API's limit, from Cloudflare's header only", async () => {
        fetchMock.mockResolvedValue(upstream(200));
        await POST(
            message(GOOD, {
                "cf-connecting-ip": "203.0.113.7",
                "x-forwarded-for": "198.51.100.1",
            }),
        );
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Record<string, string>;
        expect(headers["x-saroh-relay"]).toMatch(/^v1\./);
        expect(JSON.stringify(headers)).not.toContain("198.51.100.1");
    });

    it.each([
        [{ ...GOOD, name: " " }, "name"],
        [{ ...GOOD, email: "nope" }, "email"],
        [{ ...GOOD, message: "hey" }, "message"],
    ] as const)(
        "refuses a field at fault without calling the API",
        async (body, failure) => {
            const res = await POST(message(body));
            expect(res.status).toBe(400);
            expect(await res.json()).toEqual({ sent: false, failure });
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it("refuses what isn't a message from the form", async () => {
        for (const body of ["not json", { ...GOOD, topic: "sales" }, null]) {
            const res = await POST(message(body));
            expect(res.status).toBe(400);
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        [429, "rate-limited"],
        [400, "email"],
        [500, "unavailable"],
    ] as const)("answers the API's %s as %s", async (status, failure) => {
        fetchMock.mockResolvedValue(upstream(status));
        const res = await POST(message(GOOD));
        expect(await res.json()).toEqual({ sent: false, failure });
    });

    it("says it could not send when the API can't be reached", async () => {
        fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));
        const res = await POST(message(GOOD));
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual({
            sent: false,
            failure: "unavailable",
        });
    });

    it("says it could not send when no API is configured, rather than pretend", async () => {
        env.API_URL = undefined;
        const res = await POST(message(GOOD));
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({
            sent: false,
            failure: "unavailable",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("logs what went wrong, never the name, the email or the words", async () => {
        fetchMock.mockResolvedValue(upstream(500));
        await POST(message(GOOD));
        fetchMock.mockRejectedValue(new Error("offline"));
        await POST(message(GOOD));
        env.API_URL = undefined;
        await POST(message(GOOD));
        expect(logged).toHaveLength(3);
        const all = logged.join("\n");
        expect(all).not.toContain(GOOD.name);
        expect(all).not.toContain(GOOD.email);
        expect(all).not.toContain(GOOD.message);
    });
});
