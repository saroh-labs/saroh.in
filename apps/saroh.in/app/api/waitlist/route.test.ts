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
 * The join relay (plan U30): the visitor's country goes with the join, and
 * an API from before `country` (mid-release) still takes the join without it.
 */

const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});

function upstream(status: number, body: unknown = {}) {
    return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

function join(country?: string) {
    return new Request("https://www.saroh.in/api/waitlist", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(country ? { "x-vercel-ip-country": country } : {}),
        },
        body: JSON.stringify({
            email: "a@shop.in",
            business: "Glow Studio",
            kind: "salon",
        }),
    });
}

const sent = (call: number) =>
    JSON.parse(
        (fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;

describe("POST /api/waitlist", () => {
    it("sends the visitor's country, and says when they're outside India", async () => {
        fetchMock.mockResolvedValue(
            upstream(201, { created: true, position: 4, ref: "abcd2345" }),
        );
        const res = await POST(join("US"));
        expect(sent(0).country).toBe("US");
        expect(await res.json()).toMatchObject({
            status: "success",
            outsideIndia: true,
        });
    });

    it("says nothing about countries for a join from India", async () => {
        fetchMock.mockResolvedValue(upstream(201, { created: true }));
        const res = await POST(join("IN"));
        expect(sent(0).country).toBe("IN");
        expect(await res.json()).not.toHaveProperty("outsideIndia");
    });

    it("joins without the country when the API doesn't know the field yet", async () => {
        fetchMock
            .mockResolvedValueOnce(upstream(400))
            .mockResolvedValueOnce(upstream(201, { created: true }));
        const res = await POST(join("IN"));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(sent(1)).not.toHaveProperty("country");
        expect(await res.json()).toMatchObject({ status: "success" });
    });

    it("never retries a refusal when there was no country to drop", async () => {
        fetchMock.mockResolvedValue(upstream(400));
        const res = await POST(join());
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(400);
    });
});
