import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(
    (): {
        API_URL?: string;
        SITE_RELAY_SECRET?: string;
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
 * The QR code maker's one route (QR codes plan U9): it asks the API server
 * to server, always signed (the API refuses it otherwise), with the email
 * and nothing else — whatever a caller posts beside it is dropped — and
 * every answer the page reads is a typed state, never a thrown error.
 */

const fetchMock = vi.fn();
const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    env.API_URL = "https://api.example.test";
    env.SITE_RELAY_SECRET = undefined;
    env.NODE_ENV = "test";
});
afterEach(() => {
    fetchMock.mockReset();
    errors.mockClear();
    vi.unstubAllGlobals();
});

const upstream = (status: number, body: unknown = {}) => ({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
});

const unlock = (body: unknown) =>
    POST(
        new Request("https://www.saroh.in/api/qr-code-maker/unlock", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "cf-connecting-ip": "203.0.113.9",
            },
            body: JSON.stringify(body),
        }),
    );

describe("POST /api/qr-code-maker/unlock", () => {
    it("sends only the email, signed — never a link, a logo or a label", async () => {
        fetchMock.mockResolvedValue(
            upstream(200, { unlocked: true, emailed: "sent" }),
        );
        const res = await unlock({
            email: " a@shop.example.com ",
            link: "https://private.example.com/offer",
            logo: "data:image/png;base64,AAAA",
            label: "Scan me",
            consent: true,
        });
        expect(await res.json()).toEqual({ unlocked: true, emailed: "sent" });
        const [called, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(called).toBe(
            "https://api.example.test/public/tools/qr-code-maker/unlock",
        );
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({
            email: "a@shop.example.com",
        });
        expect(
            (init.headers as Record<string, string>)["x-saroh-relay"],
        ).toMatch(/^v1\./);
    });

    it("passes on only what the page reads from the API's answer", async () => {
        fetchMock.mockResolvedValue(
            upstream(200, { unlocked: true, emailed: "limited", id: "w1" }),
        );
        expect(
            await (await unlock({ email: "a@shop.example.com" })).json(),
        ).toEqual({ unlocked: true, emailed: "limited" });
        fetchMock.mockResolvedValue(upstream(200, { unlocked: true }));
        expect(
            await (await unlock({ email: "a@shop.example.com" })).json(),
        ).toEqual({ unlocked: true, emailed: "not-sent" });
    });

    it.each([
        [429, "rate-limited"],
        [400, "bad-email"],
        [401, "unavailable"],
        [500, "unavailable"],
    ])("answers the API's %s as %s", async (status, failure) => {
        fetchMock.mockResolvedValue(upstream(status));
        const res = await unlock({ email: "a@shop.example.com" });
        expect(await res.json()).toEqual({ unlocked: false, failure });
    });

    it("answers no email as bad-email without asking the API", async () => {
        const res = await unlock({ link: "shop.example.com" });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
            unlocked: false,
            failure: "bad-email",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("answers unavailable when the API can't be reached or isn't configured", async () => {
        fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
        expect(
            await (await unlock({ email: "a@shop.example.com" })).json(),
        ).toEqual({ unlocked: false, failure: "unavailable" });
        env.API_URL = undefined;
        expect(
            await (await unlock({ email: "a@shop.example.com" })).json(),
        ).toEqual({ unlocked: false, failure: "unavailable" });
    });

    it("answers 503 with a logged error, calling nothing, when there is no relay secret", async () => {
        env.NODE_ENV = "production";
        const res = await unlock({ email: "a@shop.example.com" });
        expect(res.status).toBe(503);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(String(errors.mock.calls[0]?.[0])).toContain(
            "SITE_RELAY_SECRET",
        );
    });
});
