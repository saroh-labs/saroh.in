import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { toNodeHandler } from "better-auth/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTrustedOrigins } from "./origins";
import { authOptions } from "./server";

/**
 * One API on two domains (DEC-204), on the real library: each address sets
 * its own domain's cookie, and a session from either reads on the other, which
 * is why the API's guard needs only one instance.
 */
function pair(global: Parameters<typeof authOptions>[0] = {}) {
    type Rows = Record<string, unknown>[];
    const db = {
        user: [] as Rows,
        session: [] as Rows,
        account: [] as Rows,
        verification: [] as Rows,
        rateLimit: [] as Rows,
    };
    const codes: string[] = [];
    const build = (baseURL: string, extra: typeof global = {}) =>
        betterAuth({
            ...authOptions({
                ...extra,
                baseURL,
                sendVerificationOTP: ({ otp }) => {
                    codes.push(otp);
                },
            }),
            trustedOrigins: ["https://accounts.saroh.tech"],
            database: memoryAdapter(db),
            rateLimit: { enabled: false, storage: "memory" },
            logger: { disabled: true },
        });
    return {
        india: build("https://api.saroh.in"),
        global: build("https://api.saroh.tech", global),
        codes,
    };
}

const post = (url: string, body: unknown) =>
    new Request(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            origin: "https://accounts.saroh.tech",
        },
        body: JSON.stringify(body),
    });

describe("one API on two domains", () => {
    beforeEach(() => {
        vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-two-addresses-only");
        vi.stubEnv("BETTER_AUTH_URL", "https://api.saroh.in");
    });

    it("signs in with its own domain's cookie, and the other reads it", async () => {
        const { india, global, codes } = pair();
        const base = "https://api.saroh.tech/api/auth";
        const email = "owner@example.com";
        await global.handler(
            post(`${base}/email-otp/send-verification-otp`, {
                email,
                type: "sign-in",
            }),
        );
        const signedIn = await global.handler(
            post(`${base}/sign-in/email-otp`, { email, otp: codes.at(-1) }),
        );
        expect(signedIn.status).toBe(200);
        const cookies = signedIn.headers.getSetCookie();
        const session = cookies.find((c) => c.includes("session_token"));
        expect(session).toMatch(/Domain=\.?saroh\.tech/i);
        expect(session).not.toMatch(/saroh\.in/i);

        const found = await india.api.getSession({
            headers: new Headers({
                cookie: cookies.map((c) => c.split(";")[0]).join("; "),
            }),
        });
        expect(found?.user.email).toBe(email);
    });

    it("gives the mounted handler the address the request came in on", async () => {
        // What the API's `mountedAuth` chooses by: lost in a library upgrade,
        // every sign-in would quietly fall back to India's cookie.
        const hosts: (string | null)[] = [];
        const handle = toNodeHandler({
            handler: (request: Request) => {
                hosts.push(request.headers.get("host"));
                return Promise.resolve(new Response("{}"));
            },
        });
        const server = createServer((req, res) => {
            void handle(req, res);
        });
        await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
        const { port } = server.address() as AddressInfo;
        await new Promise<void>((done, fail) => {
            httpRequest(
                {
                    port,
                    host: "127.0.0.1",
                    path: "/api/auth/ok",
                    headers: { host: "api.saroh.tech" },
                },
                (response) => response.resume().on("end", done),
            )
                .on("error", fail)
                .end();
        });
        await new Promise((done) => server.close(done));
        expect(hosts).toEqual(["api.saroh.tech"]);
    });

    it("keeps what the mount reads when the handler is swapped", () => {
        // `mountedAuth` in the API is `{ ...auth, handler }`.
        const { india } = pair();
        const mounted = { ...india };
        expect(mounted.options.baseURL).toBe("https://api.saroh.in");
        expect(mounted.api.getSession).toBeTypeOf("function");
    });

    it("trusts both editions' addresses, and nothing of development's", () => {
        vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "");
        const origins = getTrustedOrigins();
        for (const origin of [
            "https://www.saroh.in",
            "https://saroh.in",
            "https://app.saroh.in",
            "https://accounts.saroh.in",
            "https://admin.saroh.in",
            "https://api.saroh.in",
            "https://saroh.app",
            "https://docs.saroh.in",
            "https://help.saroh.in",
            "https://templates.saroh.in",
            "https://ui.saroh.in",
            "https://saroh.tech",
            "https://app.saroh.tech",
            "https://accounts.saroh.tech",
            "https://admin.saroh.tech",
            "https://api.saroh.tech",
        ]) {
            expect(origins).toContain(origin);
        }
        expect(origins.join()).not.toMatch(/saroh\.io|saroh\.dev/);
    });

    it("never sets a SameSite=None session cookie, on either address", async () => {
        const { india, global, codes } = pair();
        const email = "lax@example.com";
        for (const [instance, base] of [
            [india, "https://api.saroh.in/api/auth"],
            [global, "https://api.saroh.tech/api/auth"],
        ] as const) {
            await instance.handler(
                post(`${base}/email-otp/send-verification-otp`, {
                    email,
                    type: "sign-in",
                }),
            );
            const signedIn = await instance.handler(
                post(`${base}/sign-in/email-otp`, { email, otp: codes.at(-1) }),
            );
            expect(signedIn.status).toBe(200);
            const cookies = signedIn.headers.getSetCookie();
            expect(cookies.length).toBeGreaterThan(0);
            for (const cookie of cookies) {
                expect(cookie).not.toMatch(/SameSite=None/i);
            }
            const session = cookies.find((c) => c.includes("session_token"));
            expect(session).toMatch(/SameSite=Lax/i);
        }
    });

    it("gives each address its own GitHub app (KTD5)", () => {
        vi.stubEnv("AUTH_GITHUB_ID", "india-id");
        vi.stubEnv("AUTH_GITHUB_SECRET", "india-secret");
        const { india, global } = pair({
            github: { clientId: "global-id", clientSecret: "global-secret" },
        });
        expect(india.options.socialProviders?.github?.clientId).toBe(
            "india-id",
        );
        expect(global.options.socialProviders?.github?.clientId).toBe(
            "global-id",
        );
        expect(global.options.baseURL).toBe("https://api.saroh.tech");
    });

    it("leaves GitHub off an address with no pair, and refuses it cleanly", async () => {
        vi.stubEnv("AUTH_GITHUB_ID", "india-id");
        vi.stubEnv("AUTH_GITHUB_SECRET", "india-secret");
        const { india, global } = pair({ github: null });
        expect(global.options.socialProviders?.github).toBeUndefined();
        expect(global.options.socialProviders?.google).toBeDefined();
        expect(india.options.socialProviders?.github?.clientId).toBe(
            "india-id",
        );
        const refused = await global.handler(
            post("https://api.saroh.tech/api/auth/sign-in/social", {
                provider: "github",
                callbackURL: "https://accounts.saroh.tech/",
            }),
        );
        expect(refused.status).toBeGreaterThanOrEqual(400);
        expect(refused.status).toBeLessThan(500);
    });
});
