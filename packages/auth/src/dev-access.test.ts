import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEV_ACCESS_COOKIE, withDevAccess } from "./dev-access";

const KEY = "a-long-random-dev-key";

async function digest(value: string) {
    const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value),
    );
    return Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
    ).join("");
}

function request(
    url: string,
    { method = "GET", cookie }: { method?: string; cookie?: string } = {},
) {
    return new NextRequest(url, {
        method,
        headers: cookie ? { cookie } : {},
    });
}

describe("withDevAccess — the dev environment's key", () => {
    const next = vi.fn(() => NextResponse.next());
    const gate = withDevAccess(next);

    beforeEach(() => {
        next.mockClear();
        vi.stubEnv("DEV_ACCESS_KEY", KEY);
        vi.stubEnv("DEV_REDIRECT_ORIGIN", "https://app.saroh.in");
        vi.stubEnv("DEV_ACCESS_COOKIE_DOMAIN", ".saroh.io");
    });
    afterEach(() => vi.unstubAllEnvs());

    it("does nothing where no key is set — production and local", async () => {
        vi.stubEnv("DEV_ACCESS_KEY", "");
        const res = await gate(request("https://app.saroh.in/orders"));
        expect(next).toHaveBeenCalledOnce();
        expect(res.headers.get("X-Robots-Tag")).toBeNull();
    });

    it("the right key sets the cookie and reloads the page without it", async () => {
        const res = await gate(
            request("https://app.saroh.io/orders?status=open&access=" + KEY),
        );
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toBe(
            "https://app.saroh.io/orders?status=open",
        );
        const setCookie = res.headers.get("set-cookie") ?? "";
        expect(setCookie).toContain(
            `${DEV_ACCESS_COOKIE}=${await digest(KEY)}`,
        );
        expect(setCookie).not.toContain(KEY + ";");
        expect(setCookie).toMatch(/Domain=\.saroh\.io/i);
        expect(setCookie).toMatch(/HttpOnly/i);
        expect(setCookie).toMatch(/Secure/i);
    });

    it("lets a browser with the cookie through, unindexed", async () => {
        const res = await gate(
            request("https://app.saroh.io/orders", {
                cookie: `${DEV_ACCESS_COOKIE}=${await digest(KEY)}`,
            }),
        );
        expect(next).toHaveBeenCalledOnce();
        expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("sends anyone else to the same page on production", async () => {
        const res = await gate(
            request("https://app.saroh.io/orders?status=open"),
        );
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe(
            "https://app.saroh.in/orders?status=open",
        );
    });

    it("sends anyone else to one page when it is told to (accounts before early access)", async () => {
        vi.stubEnv("DEV_REDIRECT_ORIGIN", "https://www.saroh.in");
        vi.stubEnv("DEV_REDIRECT_PATH", "/");
        const res = await gate(
            request("https://accounts.saroh.in/login?returnTo=x"),
        );
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("https://www.saroh.in/");
    });

    it("a wrong key is treated as none, and is not carried to production", async () => {
        const res = await gate(
            request("https://app.saroh.io/orders?access=guess"),
        );
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("https://app.saroh.in/orders");
        expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("a cookie from an old key no longer opens it", async () => {
        const res = await gate(
            request("https://app.saroh.io/", {
                cookie: `${DEV_ACCESS_COOKIE}=${await digest("the-old-key")}`,
            }),
        );
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toBe(307);
    });

    it("refuses a form post rather than replaying it on production", async () => {
        const res = await gate(
            request("https://app.saroh.io/orders", { method: "POST" }),
        );
        expect(res.status).toBe(404);
        expect(next).not.toHaveBeenCalled();
    });

    it("refuses rather than guessing when it has nowhere to send visitors", async () => {
        vi.stubEnv("DEV_REDIRECT_ORIGIN", "");
        const res = await gate(request("https://app.saroh.io/"));
        expect(res.status).toBe(404);
    });
});
