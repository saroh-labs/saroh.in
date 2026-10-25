import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sign-up page's view (DEC-187, amended 24 Oct): the page's server sends
 * an anonymous count to the API after the page has gone out, with the
 * link's source or else the `saroh_src` cookie's, and never a code; and it
 * never throws, however the API answers.
 */

const request = vi.hoisted(() => ({
    headers: new Headers(),
    cookies: new Map<string, string>(),
}));
const pending = vi.hoisted(() => [] as (() => Promise<unknown>)[]);

vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(request.headers),
    cookies: () =>
        Promise.resolve({
            get: (name: string) =>
                request.cookies.has(name)
                    ? { name, value: request.cookies.get(name) }
                    : undefined,
            has: (name: string) => request.cookies.has(name),
        }),
}));
vi.mock("next/server", () => ({
    after: (task: () => Promise<unknown>) => pending.push(task),
}));
vi.mock("@/lib/api", () => ({ apiBase: () => "https://api.test" }));

const { recordSignupView } = await import("./signup-viewed");

const PHONE = "Mozilla/5.0 (iPhone) Mobile Safari/604.1";
const fetchMock = vi.fn();

async function sent(): Promise<Record<string, unknown> | null> {
    for (const task of pending.splice(0)) await task();
    const call = fetchMock.mock.calls[0] as
        [string, { body: string; headers: Record<string, string> }] | undefined;
    if (!call) return null;
    expect(call[0]).toBe("https://api.test/public/funnel/signup-viewed");
    expect(call[1].headers["user-agent"]).toBe(PHONE);
    return JSON.parse(call[1].body) as Record<string, unknown>;
}

describe("recordSignupView", () => {
    beforeEach(() => {
        request.headers = new Headers({ "user-agent": PHONE });
        request.cookies = new Map();
        fetchMock
            .mockReset()
            .mockResolvedValue(new Response(null, { status: 204 }));
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        pending.length = 0;
    });

    it("sends the link's source, plan and cycle, after the page", async () => {
        await recordSignupView({
            src: "pricing",
            utm_source: "google",
            plan: "grow",
            cycle: "year",
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await sent()).toEqual({
            src: "pricing",
            utm_source: "google",
            plan: "grow",
            cycle: "year",
            referral_channel: "none",
        });
    });

    it("reads the saroh_src cookie when the link has no source", async () => {
        request.cookies.set("saroh_src", "src=home_hero&utm_campaign=launch");
        await recordSignupView({});
        expect(await sent()).toMatchObject({
            src: "home_hero",
            utm_campaign: "launch",
        });
    });

    it("prefers the link's source to the cookie's", async () => {
        request.cookies.set("saroh_src", "src=home_hero&utm_campaign=launch");
        await recordSignupView({ src: "pricing" });
        const body = await sent();
        expect(body?.src).toBe("pricing");
        expect(body).not.toHaveProperty("utm_campaign");
    });

    it("says which referral code was carried, never the code", async () => {
        request.cookies.set("saroh_ref", "ab2cd3ef");
        request.cookies.set("saroh_am", "AB2CD3EF.1790000000");
        await recordSignupView({});
        const body = await sent();
        expect(body?.referral_channel).toBe("both");
        expect(JSON.stringify(body)).not.toMatch(/ab2cd3ef/i);

        fetchMock.mockClear();
        request.cookies.delete("saroh_ref");
        await recordSignupView({});
        expect((await sent())?.referral_channel).toBe("account_manager");
    });

    it("sends no session cookie with it", async () => {
        request.headers.set("cookie", "saroh.session_token=secret");
        await recordSignupView({});
        await sent();
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(JSON.stringify(init)).not.toContain("secret");
    });

    it("sends nothing for a router prefetch or a Server Action", async () => {
        for (const header of ["next-router-prefetch", "next-action"]) {
            request.headers = new Headers({
                "user-agent": PHONE,
                [header]: "1",
            });
            await recordSignupView({});
        }
        expect(await sent()).toBeNull();
    });

    it("never throws when the API is down", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        await expect(
            recordSignupView({ src: "pricing" }),
        ).resolves.toBeUndefined();
        await expect(
            Promise.all(pending.splice(0).map((task) => task())),
        ).resolves.toBeDefined();
    });

    it("never throws when the request can't be read", async () => {
        request.headers = undefined as unknown as Headers;
        await expect(recordSignupView({})).resolves.toBeUndefined();
    });
});
