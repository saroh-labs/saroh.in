import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";

import type { CreateAuthOptions } from "./server";
import { authOptions } from "./server";

/**
 * A session's life on the real library with Saroh's options: signed in by an
 * emailed code, read back, ended by sign-out, and refused once revoked from
 * another device. Written before the better-auth 1.7.14 → 1.7.19 upgrade
 * (#1343), whose releases changed how revoked sessions are refused; an
 * upgrade that lets a revoked or signed-out session keep working fails here.
 */

const ORIGIN = "https://accounts.saroh.in";
const BASE = "https://api.saroh.in";

type Sent = Parameters<
    NonNullable<CreateAuthOptions["sendVerificationOTP"]>
>[0];

function stack() {
    const sent: Sent[] = [];
    type Rows = Record<string, unknown>[];
    const db = {
        user: [] as Rows,
        session: [] as Rows,
        account: [] as Rows,
        verification: [] as Rows,
        rateLimit: [] as Rows,
    };
    const auth = betterAuth({
        ...authOptions({ sendVerificationOTP: (mail) => void sent.push(mail) }),
        baseURL: BASE,
        trustedOrigins: [ORIGIN],
        database: memoryAdapter(db),
        rateLimit: { enabled: false, storage: "memory" },
        logger: { disabled: true },
    });
    async function call(
        method: "GET" | "POST",
        path: string,
        cookie = "",
        body?: unknown,
    ) {
        const response = await auth.handler(
            new Request(`${BASE}/api/auth${path}`, {
                method,
                headers: {
                    origin: ORIGIN,
                    "x-forwarded-for": "203.0.113.7",
                    ...(body ? { "content-type": "application/json" } : {}),
                    ...(cookie ? { cookie } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
            }),
        );
        const text = await response.text();
        return {
            status: response.status,
            setCookie: response.headers.getSetCookie(),
            body: (text ? JSON.parse(text) : null) as Record<
                string,
                unknown
            > | null,
        };
    }
    /** Signs in with a fresh code; returns the session cookie to send back. */
    async function signIn(email: string) {
        await call("POST", "/email-otp/send-verification-otp", "", {
            email,
            type: "sign-in",
        });
        const otp = sent.at(-1)?.otp ?? "";
        const res = await call("POST", "/sign-in/email-otp", "", {
            email,
            otp,
        });
        expect(res.status).toBe(200);
        const token = res.setCookie
            .map((c) => c.split(";")[0] ?? "")
            .find((c) => c.includes("session_token="));
        expect(token).toBeTruthy();
        return token ?? "";
    }
    const session = (cookie: string) => call("GET", "/get-session", cookie);
    return { call, signIn, session, db };
}

describe("a session's life", () => {
    it("reads back the signed-in person", async () => {
        const s = stack();
        const cookie = await s.signIn("asha@example.com");
        const res = await s.session(cookie);
        expect(res.status).toBe(200);
        expect((res.body?.user as { email?: string } | undefined)?.email).toBe(
            "asha@example.com",
        );
    });

    it("ends at sign-out: the same cookie reads no session after", async () => {
        const s = stack();
        const cookie = await s.signIn("asha@example.com");
        const out = await s.call("POST", "/sign-out", cookie, {});
        expect(out.status).toBe(200);
        const res = await s.session(cookie);
        expect(res.body).toBeNull();
    });

    it("refuses a session revoked from another device at once", async () => {
        const s = stack();
        const phone = await s.signIn("asha@example.com");
        const laptop = await s.signIn("asha@example.com");
        expect(s.db.session).toHaveLength(2);
        const out = await s.call("POST", "/revoke-other-sessions", laptop, {});
        expect(out.status).toBe(200);
        expect((await s.session(phone)).body).toBeNull();
        expect((await s.session(laptop)).body).not.toBeNull();
    });

    it("reads no session for a made-up cookie", async () => {
        const s = stack();
        await s.signIn("asha@example.com");
        const res = await s.session("better-auth.session_token=forged.value");
        expect(res.body).toBeNull();
    });
});
