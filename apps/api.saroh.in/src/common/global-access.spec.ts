import { createHash } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import {
    accessCookieOf,
    cookieOpens,
    globalAccessGate,
    isGlobalHost,
} from "./global-access";

const KEY = "made-up-key-for-a-test";
const DIGEST = createHash("sha256").update(KEY).digest("hex");

function run(gate: ReturnType<typeof globalAccessGate>, req: Partial<Request>) {
    const next = jest.fn() as unknown as NextFunction;
    const res = {
        statusCode: 200,
        location: "",
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) {
            this.headers[name] = value;
        },
        redirect(status: number, to: string) {
            this.statusCode = status;
            this.location = to;
        },
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json() {
            return this;
        },
    };
    gate(
        { method: "GET", path: "/", headers: {}, ...req } as Request,
        res as unknown as Response,
        next,
    );
    return { next: next as unknown as jest.Mock, res };
}

describe("globalAccessGate (Global behind the key, 16 Nov 2026)", () => {
    const gate = globalAccessGate(KEY);

    it("knows saroh.tech's addresses, and nothing else", () => {
        expect(isGlobalHost("api.saroh.tech")).toBe(true);
        expect(isGlobalHost("mcp.saroh.tech:443")).toBe(true);
        expect(isGlobalHost("saroh.tech")).toBe(true);
        expect(isGlobalHost("api.saroh.in")).toBe(false);
        expect(isGlobalHost("evilsaroh.tech")).toBe(false);
    });

    it("leaves India's API alone", () => {
        const { next } = run(gate, {
            headers: { host: "api.saroh.in" },
            method: "POST",
            path: "/api/auth/sign-up/email",
        });
        expect(next).toHaveBeenCalled();
    });

    it("does nothing where no key is set", () => {
        const { next } = run(globalAccessGate(undefined), {
            headers: { host: "api.saroh.tech" },
            method: "POST",
        });
        expect(next).toHaveBeenCalled();
    });

    it("refuses a call without the cookie, and sends a page load to saroh.in", () => {
        const post = run(gate, {
            headers: { host: "api.saroh.tech" },
            method: "POST",
            path: "/api/auth/sign-up/email",
        });
        expect(post.next).not.toHaveBeenCalled();
        expect(post.res.statusCode).toBe(403);
        const get = run(gate, {
            headers: { host: "api.saroh.tech" },
            path: "/organizations",
        });
        expect(get.res.statusCode).toBe(302);
        expect(get.res.location).toBe("https://www.saroh.in/");
        expect(get.res.headers["X-Robots-Tag"]).toContain("noindex");
    });

    it("lets the access cookie in, and no forgery of it", () => {
        const ok = run(gate, {
            headers: {
                host: "api.saroh.tech",
                cookie: `a=1; saroh-dev-access=${DIGEST}; b=2`,
            },
            method: "POST",
            path: "/api/auth/sign-in/email-otp",
        });
        expect(ok.next).toHaveBeenCalled();
        for (const cookie of [
            `saroh-dev-access=${KEY}`,
            "saroh-dev-access=",
            `saroh-dev-access=${DIGEST}x`,
        ]) {
            const no = run(gate, {
                headers: { host: "api.saroh.tech", cookie },
                method: "POST",
            });
            expect(no.next).not.toHaveBeenCalled();
        }
    });

    it("keeps health checks and the published plans open", () => {
        for (const path of ["/health", "/health/ready", "/public/pricing"]) {
            const { next } = run(gate, {
                headers: { host: "api.saroh.tech" },
                path,
            });
            expect(next).toHaveBeenCalled();
        }
        const write = run(gate, {
            headers: { host: "api.saroh.tech" },
            method: "POST",
            path: "/public/pricing",
        });
        expect(write.next).not.toHaveBeenCalled();
    });

    it("lets a CORS preflight through, which carries no cookies", () => {
        const { next } = run(gate, {
            headers: { host: "api.saroh.tech" },
            method: "OPTIONS",
            path: "/api/auth/get-session",
        });
        expect(next).toHaveBeenCalled();
    });

    it("reads the cookie out of a header", () => {
        expect(accessCookieOf("x=1; saroh-dev-access=abc")).toBe("abc");
        expect(accessCookieOf(undefined)).toBeNull();
        expect(cookieOpens(DIGEST, KEY)).toBe(true);
        expect(cookieOpens(null, KEY)).toBe(false);
    });
});
