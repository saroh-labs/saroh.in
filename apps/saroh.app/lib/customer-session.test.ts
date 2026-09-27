import { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({
    value: undefined as string | undefined,
    set: vi.fn(),
    requestHeaders: new Headers(),
}));

vi.mock("next/headers", () => ({
    cookies: () =>
        Promise.resolve({
            get: (name: string) =>
                name === "__Host-saroh_session" && jar.value !== undefined
                    ? { name, value: jar.value }
                    : undefined,
            set: jar.set,
        }),
    headers: () => Promise.resolve(jar.requestHeaders),
}));

import {
    accountFetch,
    clearedSessionCookie,
    CUSTOMER_SESSION_HEADER,
    getSignedInCustomer,
    SESSION_COOKIE,
    sessionCookie,
    siteAccountsFetch,
} from "./customer-session";

/**
 * The session cookie and the calls that carry it (round-2 plan A, A3).
 */
function setCookieHeader(cookie: ReturnType<typeof sessionCookie>): string {
    const headers = new Headers();
    new ResponseCookies(headers).set(cookie);
    return headers.get("set-cookie") ?? "";
}

const fetchMock = vi.fn();

beforeEach(() => {
    jar.value = undefined;
    jar.set.mockReset();
    jar.requestHeaders = new Headers({
        host: "kavi.saroh.app",
        "x-real-ip": "203.0.113.7",
        cookie: "__Host-saroh_session=tok; other=1",
    });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("the session cookie", () => {
    it("is __Host-, Secure, HttpOnly, SameSite=Lax, Path=/ and never has a Domain", () => {
        const expires = new Date("2026-10-27T10:00:00Z");
        const header = setCookieHeader(sessionCookie("tok123", expires));
        expect(header.startsWith(`${SESSION_COOKIE}=tok123`)).toBe(true);
        expect(SESSION_COOKIE.startsWith("__Host-")).toBe(true);
        expect(header).toMatch(/; Path=\/(;|$)/);
        expect(header).toMatch(/; Secure/);
        expect(header).toMatch(/; HttpOnly/);
        expect(header).toMatch(/; SameSite=lax/i);
        expect(header).toContain(`Expires=${expires.toUTCString()}`);
        expect(header.toLowerCase()).not.toContain("domain=");
    });

    it("is cleared with the same attributes, empty and already expired", () => {
        const header = setCookieHeader(clearedSessionCookie());
        expect(header.startsWith(`${SESSION_COOKIE}=;`)).toBe(true);
        expect(header).toMatch(/; Secure/);
        expect(header).toMatch(/; Path=\//);
        expect(header).toContain(`Expires=${new Date(0).toUTCString()}`);
        expect(header.toLowerCase()).not.toContain("domain=");
    });
});

describe("calls to the API", () => {
    it("sends the relay for the served host and never the visitor's cookies", async () => {
        fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
        const call = await siteAccountsFetch("options");
        expect(call.ok).toBe(true);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toMatch(/\/public\/site-accounts\/options$/);
        const sent = init.headers as Record<string, string>;
        const host = sent["x-saroh-relay"].split(".")[3];
        expect(Buffer.from(host, "base64url").toString()).toBe(
            "kavi.saroh.app",
        );
        expect(Object.keys(sent).map((k) => k.toLowerCase())).not.toContain(
            "cookie",
        );
        expect(sent[CUSTOMER_SESSION_HEADER]).toBeUndefined();
    });

    it("forwards the session in its own header", async () => {
        jar.value = "tok";
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ email: "a@b.in", name: null }), {
                status: 200,
            }),
        );
        await expect(getSignedInCustomer()).resolves.toEqual({
            email: "a@b.in",
            name: null,
        });
        const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
        expect(
            (init.headers as Record<string, string>)[CUSTOMER_SESSION_HEADER],
        ).toBe("tok");
    });

    it("is signed out without asking the API when there is no cookie", async () => {
        await expect(accountFetch("session")).resolves.toBeNull();
        await expect(getSignedInCustomer()).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("clears the cookie when the API refuses the session", async () => {
        jar.value = "revoked";
        fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
        await expect(getSignedInCustomer()).resolves.toBeNull();
        expect(jar.set).toHaveBeenCalledWith(clearedSessionCookie());
    });

    it("makes no call without a served host", async () => {
        jar.requestHeaders = new Headers({ "x-real-ip": "203.0.113.7" });
        await expect(siteAccountsFetch("options")).resolves.toEqual({
            ok: false,
            reason: "no-host",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("says so when the API can't be reached", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        await expect(siteAccountsFetch("options")).resolves.toEqual({
            ok: false,
            reason: "unreachable",
        });
    });
});
